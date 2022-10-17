// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

const core = require('@actions/core');
const exec = require('@actions/exec');
//const github = require('@actions/github');
const artifact = require('@actions/artifact');
const cache = require('@actions/cache');

const flatpak = require('./flatpak.js');
const flatpakBuilder = require('./flatpakBuilder.js');
const utils = require('./utils.js');

const CACHE_FLATPAK_BUILDER_DIRS = ['.flatpak-builder'];


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

    const restoreId = await cache.restoreCache(CACHE_FLATPAK_BUILDER_DIRS,
        buildKey, ['flatter-', `flatter-${arch}-`]);
    if (restoreId)
        core.info(`Build directory restored from cache: ${restoreId}`);

    await flatpakBuilder.run('_build', manifest);

    const saveId = await cache.saveCache(CACHE_FLATPAK_BUILDER_DIRS,
        buildKey);
    if (saveId !== -1)
        core.info(`Build directory saved to cache: ${saveId}`);
}

/**
 * Run a complete build
 */
async function run() {
    const cacheKey = 'flatter';
    const manifests = utils.getStrvInput('manifests');
    const repo = core.getInput('repo');

    /*
     * Rebuild the repository
     */
    const repoId = await cache.restoreCache([repo], cacheKey, [cacheKey]);
    if (repoId)
        core.info(`Flatpak repository restored from cache: ${repoId}`);

    for (const manifest of manifests)
        await buildManifest(manifest);

    if (core.getInput('gpg-sign'))
        await flatpak.signRepository(repo, core.getInput('gpg-sign'));

    const repoSaveId = await cache.saveCache([repo], cacheKey);
    if (repoSaveId !== -1)
        core.info(`Flatpak repository saved to cache: ${cacheKey}`);

    /*
     * GitHub Pages Artifact
     */
    if (core.getBooleanInput('pages-artifact')) {
        try {
            await uploadRepositoryArtifact(repo);
        } catch (e) {
            core.warning(`GitHub Pages failed: ${e.message}`);
        }
    }

    /*
     * Flatpak Bundles
     */
    if (core.getBooleanInput('bundle-artifact')) {
        try {
            for (const manifestPath of manifests) {
                const manifest = await flatpak.parseManifest(manifestPath);
                const appId = manifest['app-id'] || manifest['id'];
                const branch = manifest['branch'] ||
                    core.getInput('default-branch')
                    manifest['default-branch'] ||
                    'master';

                await uploadBundleArtifact(repo, appId, branch);
            }
        } catch (e) {
            core.warning(`Flatpak Bundle failed: ${e.message}`);
        }
    }
}


module.exports = {
    run,
};


if (require.main === module)
    run();
    
