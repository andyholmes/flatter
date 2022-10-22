// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as artifact from '@actions/artifact';
import * as core from '@actions/core';

import * as fs from 'fs';
import * as path from 'path';

import * as flatter from './flatter.js';
import * as utils from './utils.js';


async function includeFiles(repo) {
    const files = utils.getStrvInput('include-files');
    const operations = files.map(src => {
        const dest = path.join(repo, path.basename(src));
        return fs.promises.copyFile(src, dest);
    });

    return Promise.allSettled(operations);
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
    await flatter.restoreRepository();

    for (const manifest of manifests) {
        core.startGroup(`Building "${manifest}"...`);

        try {
            await flatter.buildApplication(repo, manifest);
        } catch (e) {
            core.warning(`Failed to build "${manifest}": ${e.message}`);
        }

        core.endGroup();
    }

    await flatter.saveRepository();

    /*
     * GitHub Pages Artifact
     */
    if (core.getBooleanInput('upload-pages-artifact')) {
        core.startGroup('Uploading GitHub Pages artifact...');

        // Generate a .flatpakrepo file
        try {
            await flatter.generateFlatpakrepo(repo);
        } catch (e) {
            core.warning(`Failed to generate .flatpakrepo: ${e.message}`);
        }

        // Copy extra files to the repository directory
        try {
            await includeFiles(repo);
        } catch (e) {
            core.warning(`Failed to copy extra files: ${e.message}`);
        }

        // Upload the repository directory as a Github Pages artifact
        try {
            await utils.uploadPagesArtifact(repo);
        } catch (e) {
            core.warning(`Failed to upload GitHub Pages artifact: ${e.message}`);
        }

        core.endGroup();
    }

    /*
     * Flatpak Bundles
     */
    if (core.getBooleanInput('upload-bundles')) {
        core.startGroup('Uploading Flatpak bundles...');

        const artifactClient = artifact.create();

        for (const manifest of manifests) {
            try {
                const fileName = await flatter.bundleApplication(repo,
                    manifest);
                const artifactName = fileName.replace('.flatpak',
                    `-${core.getInput('arch')}`);

                await artifactClient.uploadArtifact(artifactName, [fileName],
                    '.', { continueOnError: false });
            } catch (e) {
                core.warning(`Failed to bundle "${manifest}": ${e.message}`);
            }
        }

        core.endGroup();
    }
}

run();

export default run;
    
