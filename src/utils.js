// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as core from '@actions/core';

import * as crypto from 'crypto';
import * as fs from 'fs';

export {
    checksumFile,
    getStrvInput,
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

