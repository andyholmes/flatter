// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as artifact from '@actions/artifact';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import * as flatpak from './flatpak.js';
import * as flatpakBuilder from './flatpakBuilder.js';
import * as utils from './utils.js';


/**
 * Upload a Flatpak repository as a GitHub Pages Artifact.
 *
 * See: https://github.com/actions/upload-pages-artifact/blob/main/action.yml
 *
 * @param {PathLike} repositoryPath - A path to a Flatpak repository
 */
async function uploadRepositoryArtifact(repositoryPath) {
    const outputPath = 'artifact.tar';
    await exec.exec('tar', [
        '--dereference',
        '--hard-dereference',
        '--directory', repositoryPath,
        '-cf', outputPath,
        '--exclude=.git',
        '--exclude=.github',
        '.',
    ]);

    const artifactClient = artifact.create();
    await artifactClient.uploadArtifact('github-pages', [outputPath], '.');
}

/**
 * Build and upload a Flatpak bundle.
 *
 * @param {PathLike} repo - A path to a Flatpak repository
 * @param {string} appId - The application ID
 * @param {string} branch - The Flatpak branch
 * @returns {Promise<>} A promise for the operation
 */
async function uploadBundleArtifact(repo, appId, branch) {
    core.info(`Building ${appId}...`);

    const fileName = `${appId}.flatpak`;
    await flatpak.buildBundle(repo, fileName, appId, branch);

    const artifactName = `${appId}-${core.getInput('arch')}`;
    const artifactClient = artifact.create();
    return artifactClient.uploadArtifact(artifactName, [fileName], '.', {
        continueOnError: false,
    });
}

/**
 * Build a Flatpak for the repository.
 *
 * A single repository cache is kept for all builds, while each architecture has
 * its own cache. This keeps the benefits of caching, while being able to serve
 * multiple architectures from the same repository.
 *
 * @param {PathLike} manifest - A path to a Flatpak manifest
 */
async function buildManifest(manifest) {
    const arch = core.getInput('arch');
    const checksum = await utils.checksumFile(manifest);
    const buildKey = `flatter-${arch}-${checksum}`;

    const cacheId = await cache.restoreCache(flatpakBuilder.CACHE_PATHS,
        buildKey);

    await flatpakBuilder.run('_build', manifest);

    if (buildKey !== cacheId) {
        const saveId = await cache.saveCache(flatpakBuilder.CACHE_PATHS,
            buildKey);
        if (saveId !== -1)
            core.info(`Build directory saved to cache: ${saveId}`);
    }
}

/**
 * Run the action
 */
async function run() {
    const manifests = utils.getStrvInput('files');
    const repo = core.getInput('repo');

    /*
     * Rebuild the repository
     */
    await utils.restoreRepository();

    for (const manifestPath of manifests)
        await buildManifest(manifestPath);

    if (core.getInput('gpg-sign'))
        await flatpak.signRepository(repo);

    await utils.saveRepository();

    /*
     * GitHub Pages Artifact
     */
    if (core.getBooleanInput('upload-pages-artifact')) {
        try {
            await uploadRepositoryArtifact(repo);
        } catch (e) {
            core.warning(`GitHub Pages failed: ${e.message}`);
        }
    }

    /*
     * Flatpak Bundles
     */
    if (core.getBooleanInput('upload-flatpak-bundle')) {
        try {
            for (const manifestPath of manifests) {
                const manifest = await flatpak.parseManifest(manifestPath);
                const appId = manifest['app-id'] || manifest['id'];
                const branch = manifest['branch'] ||
                    core.getInput('default-branch') ||
                    manifest['default-branch'] ||
                    'master';

                await uploadBundleArtifact(repo, appId, branch);
            }
        } catch (e) {
            core.warning(`Flatpak Bundle failed: ${e.message}`);
        }
    }
}

run();

export default run;
    
