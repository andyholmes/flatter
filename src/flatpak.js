// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

const core = require('@actions/core');
const exec = require('@actions/exec');
const yaml = require('js-yaml');

const fs = require('fs').promises;
const path = require('path');


/**
 * Load a manifest
 *
 * @param {PathLike} manifestPath - A path to a Flatpak manifest
 */
async function parseManifest(manifestPath) {
    const data = await fs.readFile(manifestPath);

    switch (path.extname(manifestPath)) {
        case '.json':
            return JSON.parse(data);

        case '.yaml':
        case '.yml':
            return yaml.safeLoad(data);

        default:
            throw TypeError('Unsupported manifest format');
    }
}

const FLATPAK_BUILD_BUNDLE_OPTIONS = [
    'gpg-sign',
    'gpg-homedir',
];

/**
 * Build a Flatpak bundle.
 *
 * @param {PathLike} repo - A path to a Flatpak repository
 * @param {PathLike} fileName - A filename
 * @param {string} appId - The application ID
 * @param {string} [branch] - The Flatpak branch (default: master)
 * @param {string[]} [args] - Extra options for `flatpak build-bundle`
 * @returns {Promise<>} A promise for the operation
 */
async function buildBundle(repo, fileName, appId, branch = 'master', args = []) {
    const bundleArgs = new Set([...args]);

    for (const option of FLATPAK_BUILD_BUNDLE_OPTIONS) {
        if (core.getInput(option))
            bundleArgs.add(`--${option}=${core.getInput(option)}`);
    }

    return exec.exec('flatpak', [
        'build-bundle',
        ...bundleArgs,
        repo,
        fileName,
        appId,
        branch,
    ]);
}

/**
 * Sign a Flatpak repository.
 *
 * @param {PathLike} repo - A path to a repository
 * @param {string} gpgKey - The GPG key to sign with
 */
async function signRepository(repo, gpgKey) {
    if (!gpgKey)
        return;

    await exec.exec('flatpak', [
        'build-sign',
        repo,
        `--gpg-sign=${gpgKey}`,
    ]);
    await exec.exec('flatpak', [
        'build-update-repo',
        repo,
        `--gpg-sign=${gpgKey}`,
    ]);
}


module.exports = {
    parseManifest,
    buildBundle,
    signRepository,
};

