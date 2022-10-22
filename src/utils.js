// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as artifact from '@actions/artifact';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

export {
    getStrvInput,
    uploadPagesArtifact,
};


/**
 * Get an input as a list of strings.
 *
 * See: https://github.com/actions/toolkit/issues/184
 *
 * @param {string} name - An input name
 * @param {core.InputOptions} [options] - Input options
 * @returns {string[]} A list of strings
 */
function getStrvInput(name, options = {}) {
    return core
        .getInput(name, options)
        .split("\n")
        .filter(x => x !== '');
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

