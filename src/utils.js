// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as artifact from '@actions/artifact';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import * as crypto from 'crypto';
import * as fs from 'fs';

export {
    checksumFile,
    getStrvInput,
    restoreRepository,
    saveRepository,
    uploadPagesArtifact,
};


/**
 * Checksum a file.
 *
 * See: https://stackoverflow.com/a/44643479/1108697
 *
 * @param {PathLike} filePath - A path to a file
 * @param {string} [checksumType] - A checksum type (default: sha256)
 * @returns {string} A hex digest
 */
function checksumFile(filePath, checksumType = 'sha256') {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash(checksumType);
        const stream = fs.createReadStream(filePath);
        stream.on('error', error => reject(error));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

/**
 * Get an input as a list of strings.
 *
 * See: https://github.com/actions/toolkit/issues/184
 *
 * @param {string} name - An input name
 * @returns {string[]} A list of strings
 */
function getStrvInput(name) {
    return core
        .getInput(name)
        .split("\n")
        .filter(x => x !== '');
}

/**
 * Restore the Flatpak repository from cache.
 *
 * @returns {Promise<>} A promise for the operation
 */
async function restoreRepository() {
    core.startGroup('Restoring repository from cache...');

    try {
        // Check if caching is enabled and supported
        const baseKey = core.getInput('cache-key');
        if (!baseKey || !cache.isFeatureAvailable()) {
            core.info('Cache disabled');
            return;
        }

        // Restore the repository from cache
        const cachePaths = [core.getInput('repo')];
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
 * @returns {Promise<>} A promise for the operation
 */
async function saveRepository() {
    core.startGroup('Saving repository to cache...');

    try {
        // Check if caching is enabled and supported
        const baseKey = core.getInput('cache-key');
        if (!baseKey || !cache.isFeatureAvailable()) {
            core.info('Cache disabled');
            return;
        }

        // Save the repository to cache
        const cachePaths = [core.getInput('repo')];
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

/**
 * Upload a directory as a GitHub Pages Artifact.
 *
 * See: https://github.com/actions/upload-pages-artifact/blob/main/action.yml
 *
 * @param {PathLike} directory - A path to a directory
 */
async function uploadPagesArtifact(directory) {
    await exec.exec('tar', [
        '--dereference',
        '--hard-dereference',
        '--directory', directory,
        '-cvf', 'artifact.tar',
        '--exclude=.git',
        '--exclude=.github',
        '.',
    ]);

    const artifactClient = artifact.create();
    await artifactClient.uploadArtifact('github-pages', ['artifact.tar'], '.');
}

