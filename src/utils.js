// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as cache from '@actions/cache';
import * as core from '@actions/core';

import * as crypto from 'crypto';
import * as fs from 'fs';

export {
    checksumFile,
    getStrvInput,
    restoreRepository,
    saveRepository,
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
        const cacheKey = core.getInput('cache-key');
        if (!cacheKey || !cache.isCacheFeatureAvailable()()) {
            core.debug('Cache disabled');
            return;
        }

        // Restore the repository from cache
        const cachePaths = [core.getInput('repo')];
        const cacheId = await cache.restoreCache(cachePaths, cacheKey);

        if (!cacheId) {
            core.debug(`Cache not found with key "${cacheKey}"`);
            return;
        }

        // Check if there was a hit on the cache key
        core.saveState('cache-hit', cacheKey === cacheId);
        core.info(`Cache restored with key "${cacheKey}"`);
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
        const cacheKey = core.getInput('cache-key');
        if (!cacheKey || !cache.isCacheFeatureAvailable()()) {
            core.debug('Cache disabled');
            return;
        }

        // There was a hit on the cache key
        const cacheHit = core.getState('cache-hit');
        if (cacheHit) {
            core.debug(`Cache hit with key "${cacheKey}"`);
            return;
        }

        // Save the repository to cache
        const cachePaths = [core.getInput('repo')];
        const cacheId = await cache.saveCache(cachePaths, cacheKey);

        if (cacheId != -1)
            core.info(`Cache saved with key "${cacheKey}"`);
    } catch (e) {
        core.warning(`Failed to save repository to cache: ${e.message}`);
    }

    core.endGroup();
}

