// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as yaml from 'js-yaml';
import { spawn } from 'child_process';
import { homedir } from 'os';


export {
    buildApplication,
    bundleApplication,
    checkApplication,
    testApplication,
    generateDescription,
    restoreCache,
    saveCache,
};


/**
 * Start a D-Bus session and return the child process.
 *
 * The returned object will have two additional properties, `address` and
 * `socket`, holding the D-Bus address and socket file, respectively.
 *
 * @returns {Promise<ChildProcess>}
 */
function startDBusSession() {
    return new Promise((resolve, reject) => {
        const dbus = spawn('dbus-daemon', [
            '--session',
            '--print-address',
            `--address=unix:path=${homedir()}/dbus.socket`,
        ]);

        dbus.stdout.on('data', (data) => {
            try {
                const decoder = new TextDecoder();
                dbus.address = decoder.decode(data).trim();
                dbus.socket = `${homedir()}/dbus.socket`;

                resolve(dbus);
            } catch (e) {
                dbus.kill();
                reject(e);
            }
        });
    });
}

/**
 * Get a SHA256 checksum for a file.
 *
 * @param {PathLike} filePath - A file path
 * @returns {Promise<string>}
 */
function checksumFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', error => reject(error));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

/**
 * Load a Flatpak manifest (JSON or YAML).
 *
 * @param {PathLike} manifestPath - A path to a Flatpak manifest
 * @returns {Object} - A Flatpak manifest
 */
async function readManifest(manifestPath) {
    const data = await fs.promises.readFile(manifestPath);

    switch (path.extname(manifestPath)) {
        case '.json':
            return JSON.parse(data);

        case '.yaml':
        case '.yml':
            return yaml.load(data);

        default:
            throw TypeError('Unsupported manifest format');
    }
}

/**
 * Save a Flatpak manifest (JSON or YAML).
 *
 * @param {PathLike} manifestPath - A path to a Flatpak manifest
 * @param {Object} manifest - A Flatpak manifest
 * @returns {Promise<>} A promise for the operation
 */
async function writeManifest(manifestPath, manifest) {
    let data = null;

    switch (path.extname(manifestPath)) {
        case '.json':
            data = JSON.stringify(manifest);
            break;

        case '.yaml':
        case '.yml':
            data = yaml.dump(manifest);
            break;

        default:
            throw TypeError('Unsupported manifest format');
    }

    await fs.promises.writeFile(manifestPath, data);
}

/**
 * Generate a .flatpakrepo file and add it to the repository directory.
 *
 * @param {PathLike} directory - A path to a Flatpak repository
 * @returns {Promise<>} A promise for the operation
 */
async function generateDescription(directory) {
    /* Collect the .flatpakrepo fields */
    const {repository} = github.context.payload;

    // use the given domain name if the 'CNAME' file exists.
    let url = fs.existsSync('CNAME') ?
        `https://${(await fs.promises.readFile('CNAME')).toString()}`
        : `https://${repository.owner.login}.github.io/${repository.name}`;
    
    const metadata = {
        Title: repository.name,
        Description: repository.description,
        Url: url,
        Homepage: repository.homepage || repository.html_url,
        Icon: 'https://raw.githubusercontent.com/flatpak/flatpak/main/flatpak.png',
    };

    /* Append the GPG Public Key */
    if (core.getInput('gpg-sign')) {
        const {stdout} = await exec.getExecOutput('gpg2',
            ['--armor', '--export', core.getInput('gpg-sign')]);
        /*
         * Regex info:
         * -{5}BEGIN.*-{5}
         * ^ public key BEGIN header
         * ([\w\s/+=]*)
         * ^ capture the key (capture group 1)
         * \s=[\w\s/+=]*
         * ^ ignore the key checksum
         * -{5}END.*-{5}
         * ^ public key END header
         */
        const regex = /-{5}BEGIN.*-{5}([\w\s/+=]*)\s=[\w\s/+=]*-{5}END.*-{5}/;
        const publicKey = stdout.match(regex)[1].split('\n').join('');
        metadata['GPGKey'] = publicKey;
    }

    /* Generate and write the .flatpakrepo file */
    const filePath = path.join(directory, 'index.flatpakrepo');
    const fileData = ['[Flatpak Repo]'];

    for (const [key, value] of Object.entries(metadata))
        fileData.push(`${key}=${value}`);

    await fs.promises.writeFile(filePath, fileData.join('\n'));
}


/**
 * Build a Flatpak application for the repository.
 *
 * A single repository cache is kept for all builds, while each architecture has
 * its own cache. This keeps the benefits of caching, while being able to serve
 * multiple architectures from the same repository.
 *
 * @param {PathLike} directory - A path to a Flatpak repository
 * @param {PathLike} manifest - A path to a Flatpak manifest
 */
async function buildApplication(directory, manifest) {
    const arch = core.getInput('arch');
    const checksum = await checksumFile(manifest);
    const stateDir = `.flatpak-builder-${arch}-${checksum}`;

    let cacheId, cacheKey;
    if ((cacheKey = core.getInput('cache-key')) && cache.isFeatureAvailable()) {
        cacheKey = `${cacheKey}-${arch}-${checksum}`;
        cacheId = await cache.restoreCache([stateDir], cacheKey);
    }

    const builderArgs = [
        `--arch=${core.getInput('arch')}`,
        '--ccache',
        '--disable-rofiles-fuse',
        '--force-clean',
        `--repo=${directory}`,
        `--state-dir=${stateDir}`,
        ...(core.getMultilineInput('flatpak-builder-args')),
    ];

    if (core.getInput('gpg-sign'))
        builderArgs.push(`--gpg-sign=${core.getInput('gpg-sign')}`);

    try {
        await exec.exec('flatpak-builder', [
            ...builderArgs,
            '_build',
            manifest,
        ]);
    } catch {
        if (process.exitCode === 42 && builderArgs.includes('--skip-if-unchanged'))
            process.exitCode = 0;
    }

    if (!cacheId?.localeCompare(cacheKey, undefined, { sensitivity: 'accent' }))
        await cache.saveCache([stateDir], cacheKey);
}

/**
 * Create a single-file bundle from a local repository.
 *
 * This function is a convenience for extracting the application ID and default
 * branch from @manifest, before calling `buildBundle)()`.
 *
 * @param {PathLike} directory - A path to a Flatpak repository
 * @param {PathLike} manifest - A path to a Flatpak manifest
 * @returns {Promise<>} A promise for the operation
 */
async function bundleApplication(directory, manifest) {
    const metadata = await readManifest(manifest);
    const appId = metadata['app-id'] || metadata['id'];
    const branch = metadata['branch'] || metadata['default-branch'] || 'master';
    const fileName = `${appId}.flatpak`;

    const bundleArgs = [
        `--arch=${core.getInput('arch')}`,
        ...(core.getMultilineInput('flatpak-build-bundle-args')),
    ];

    if (core.getInput('gpg-sign'))
        bundleArgs.push(`--gpg-sign=${core.getInput('gpg-sign')}`);

    await exec.exec('flatpak', [
        'build-bundle',
        ...bundleArgs,
        directory,
        fileName,
        appId,
        branch,
    ]);

    return fileName;
}

/**
 * Check a Flatpak manifest.
 *
 * Currently this runs `flatpak-external-data-checker` on the manifest and
 * appends markdown to the GitHub job summary.
 *
 * @param {PathLike} directory - A path to a Flatpak repository
 * @param {PathLike} manifest - A path to a Flatpak manifest
 * @returns {boolean} - %true if successful, or %false if otherwise
 */
async function checkApplication(_directory, manifest) {
    const {stdout} = await exec.getExecOutput('flatpak-external-data-checker',
        [manifest]);

    if (stdout.includes('OUTDATED')) {
        const lines = stdout?.split('\n') || [];
        const md_lines = lines.reduce((accumulator, line) => {
            let match = null;

            if (line.includes('Has a new version'))
                return accumulator;

            if (line.trim().length === 0) {
                accumulator.push('');
            } else if ((match = line.match(/^OUTDATED: (.*)$/m)) != null) {
                const module = match[1].split('.')[0];
                accumulator.push(`#### \`${match[1]}\``);
                accumulator.push('');
                accumulator.push(`|  \`${module}\`  |                 |`);
                accumulator.push('|-----------------|-----------------|');
            } else if ((match = line.match(/^ {2}([^:]*): +(.*)$/m)) != null) {
                accumulator.push(`| **${match[1]}** | \`${match[2]}\` |`);
            }

          return accumulator;
        }, [`### \`${path.basename(manifest)}\`\n\n`]);

        core.summary.addRaw(md_lines.join('\n'));
        await core.summary.write();

        return false;
    }

    return true;
}

/**
 * Build a Flatpak application for testing.
 *
 * @param {PathLike} directory - A path to a Flatpak repository
 * @param {PathLike} manifest - A path to a Flatpak manifest
 */
async function testApplication(directory, manifest) {
    const arch = core.getInput('arch');
    const checksum = await checksumFile(manifest);
    const stateDir = `.flatpak-builder-${arch}-${checksum}`;

    let cacheId = core.getInput('cache-key');
    let cacheKey = core.getInput('cache-key');
    if (cacheKey && cache.isFeatureAvailable()) {
        cacheKey = `${cacheKey}-${arch}-${checksum}`;
        cacheId = await cache.restoreCache([stateDir], cacheKey);
    }

    /*
     * Prepare the Flatpak manifest
     */
    const testManifest = await readManifest(manifest);
    const testSubject = testManifest['modules'].pop();
    testSubject['run-tests'] = true;

    //
    const dbusSession = await startDBusSession();
    const buildOptions = testManifest['build-options'] || {};
    testManifest['build-options'] = {
        ...(buildOptions),
        'env': {
            ...(buildOptions['env'] || {}),
            DBUS_SESSION_BUS_ADDRESS: dbusSession.address,
            DISPLAY: '0:0',
        },
        'test-args': [
            ...(buildOptions['test-args'] || []),
            `--filesystem=${dbusSession.socket}`,
            '--device=dri',
            '--share=ipc',
            '--share=network',
            '--socket=x11',
        ],
    };

    // Extra command-line options for `meson setup`
    if (core.getInput('test-config-opts')) {
        testSubject['config-opts'] = [
            ...(testSubject['config-opts'] || []),
            ...(core.getMultilineInput('test-config-opts')),
        ];
    }

    // Ensure the sources for the test subject are a directory
    const testSubjectSources = testSubject['sources'].pop();
    if (testSubjectSources) {
        if (testSubjectSources['type'] === 'dir')
            testSubject['sources'].push(testSubjectSources);
        else
            testSubject['sources'].push({ type: 'dir', path: process.cwd() });
    }

    // Ensure the test dependencies are built before the test subject
    if (core.getInput('test-modules'))
        testManifest['modules'].push(...core.getMultilineInput('test-modules'));
    testManifest['modules'].push(testSubject);

    await writeManifest(manifest, testManifest);

    // Build Phase
    const builderArgs = [
        `--arch=${arch}`,
        '--ccache',
        '--disable-rofiles-fuse',
        '--force-clean',
        `--repo="${directory}"`,
        `--state-dir="${stateDir}"`,
        ...(core.getMultilineInput('flatpak-builder-args')),
    ];

    if (core.getInput('gpg-sign'))
        builderArgs.push(`--gpg-sign=${core.getInput('gpg-sign')}`);

    try {
        const fullCommand = [
            'xwfb-run --',
            'flatpak-builder',
            ...builderArgs,
            '_build',
            manifest,
        ].join(' ');
        await exec.exec('bash', ['-c', fullCommand]);
    } catch {
        if (process.exitCode === 42 && builderArgs.includes('--skip-if-unchanged'))
            process.exitCode = 0;
    } finally {
        dbusSession.kill();
    }

    // If the key and ID match, the cache is disabled or already saved
    if (!!cacheId?.localeCompare(cacheKey, undefined, { sensitivity: 'accent' }))
        await cache.saveCache([stateDir], cacheKey);
}

/**
 * Restore the Flatpak repository from cache.
 *
 * The repository is restored from the most recently saved cache with the same
 * `cache-key` and GPG signature (if available).
 *
 * @param {PathLike} directory - A path to a Flatpak repository
 * @returns {Promise<>} A promise for the operation
 */
async function restoreCache(directory) {
    core.startGroup('Restoring repository from cache...');

    try {
        // Check if caching is enabled and supported
        const baseKey = core.getInput('cache-key');
        if (!baseKey || !cache.isFeatureAvailable()) {
            core.info('Cache disabled');
            return;
        }

        // Restore the repository from cache
        const cachePaths = [directory];
        const cacheKey = core.getInput('gpg-sign')
            ? `${baseKey}-${core.getInput('gpg-sign')}-${Date.now()}`
            : `${baseKey}-${Date.now()}`;
        const restoreKeys = [
            core.getInput('gpg-sign')
                ? `${baseKey}-${core.getInput('gpg-sign')}-`
                : `${baseKey}-`,
        ];
        const cacheId = await cache.restoreCache(cachePaths, cacheKey,
            restoreKeys);

        if (cacheId)
            core.info(`Cache "${cacheId}" restored with key "${cacheKey}"`);
    } catch (e) {
        core.warning(`Failed to restore repository from cache: ${e.message}`);
    }

    core.endGroup();
}

/**
 * Save the Flatpak repository to cache.
 *
 * The repository is saved by appending the GPG signature (if available) and a
 * timestamp to the `cache-key`. Since the repository is restored with just the
 * GPG signature appended to the `cache-key`, a cache hit never occurs and the
 * most recently used cache is restored. The result is an incrementally updated
 * repository, built on immutable caches.
 *
 * @param {PathLike} directory - A path to a Flatpak repository
 * @returns {Promise<>} A promise for the operation
 */
async function saveCache(directory) {
    core.startGroup('Saving repository to cache...');

    try {
        // Check if caching is enabled and supported
        const baseKey = core.getInput('cache-key');
        if (!baseKey || !cache.isFeatureAvailable()) {
            core.info('Cache disabled');
            return;
        }

        // Update the repository metadata
        const updateArgs = [];
        if (core.getInput('gpg-sign'))
            updateArgs.push(`--gpg-sign=${core.getInput('gpg-sign')}`);

        await exec.exec('flatpak', [
            'build-update-repo',
            ...updateArgs,
            directory,
        ]);

        // Save the repository to cache
        const cachePaths = [directory];
        const cacheKey = core.getInput('gpg-sign')
            ? `${baseKey}-${core.getInput('gpg-sign')}-${Date.now()}`
            : `${baseKey}-${Date.now()}`;
        const cacheId = await cache.saveCache(cachePaths, cacheKey);

        if (cacheId != -1)
            core.info(`Cache "${cacheId}" saved with key "${cacheKey}"`);
    } catch (e) {
        core.warning(`Failed to save repository to cache: ${e.message}`);
    }

    core.endGroup();
}

