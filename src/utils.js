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
    try {
        // Save the cache key for post action
        const cacheKey = core.getInput('cache-key');
        core.saveState('cache-key', cacheKey);
        if (!cacheKey) {
            core.debug('Cache disabled');
            return;
        }

        const cachePaths = [core.getInput('repo')];
        const cacheId = await cache.restoreCache(cachePaths, cacheKey);

        if (!cacheId) {
            core.debug(`Cache not found with ${cacheKey}`);
            return;
        }

        // Save the cache state for post action
        core.saveState('cache-hit', cacheKey === cacheId);

        core.info(`Cache restored with ${cacheKey}`);
    } catch (error) {
        core.warning(`Failed to restore cache: ${error.message}`);
    }
}

