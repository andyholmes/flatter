# Flatter

> [!TIP]
> This action is intended for nightly or development builds for a small project.
> For more general CI tools and high-traffic use cases, see the official
> [flatpak-github-actions] and [Flathub] which has a beta channel.

Flatter is a GitHub Action for building and hosting a Flatpak repository in a
static hosting environment, such as GitHub Pages.

The action uses `flatpak` and `flatpak-builder` to build, sign and export
Flatpak applications as a repository and bundles. It includes built-in caching
to speed up builds and support an incrementally updated repository.

[flatpak-github-actions]: https://github.com/flatpak/flatpak-github-actions
[Flathub]: https://docs.flathub.org/docs/for-app-authors/submission

## Table of Contents

* [Complete Example](#complete-example)
* [Inputs](#inputs)
  * [Deployment Options](#deployment-options)
  * [Advanced Options](#advanced-options)
* [Outputs](#outputs)
* [Containers](#containers)
* [GPG Signing](#gpg-signing)
* [Deployment](#deployment)
  * [Flatpak Bundles](#flatpak-bundles)
  * [GitHub Pages](#github-pages)
  * [Custom Deploy](#custom-deploy)
* [Multiple Architectures](#multiple-architectures)

## Complete Example

```yml
name: Flatter

on:
  # Rebuild once a day
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

jobs:
  flatter:
    name: Flatter
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/andyholmes/flatter/gnome:master
      options: --privileged

    # See "Multiple Architectures" below
    strategy:
      matrix:
        arch: [x86_64, aarch64]
      fail-fast: false
      # Only one job at a time can use the shared repository cache
      max-parallel: 1

    steps:
      # Checkout a repository with Flatpak manifests
      - name: Checkout
        uses: actions/checkout@v3

      # See "GPG Signing" below
      - name: Setup GPG
        if: ${{ github.event_name != 'pull_request' }}
        id: gpg
        uses: crazy-max/ghaction-import-gpg@v5
        with:
          gpg_private_key: ${{ secrets.GPG_PRIVATE_KEY }}
          passphrase: ${{ secrets.GPG_PASSPHRASE }}

      # Generate a CNAME file on-the-fly for a configured host
      - name: Generate CNAME
        run: |
          echo "flatter.andyholmes.ca" > CNAME

      - name: Build
        uses: andyholmes/flatter@main
        with:
          files: |
            build-aux/flatpak/com.example.App.json
          arch: ${{ matrix.arch }}
          gpg-sign: ${{ steps.gpg.outputs.fingerprint }}
          upload-bundles: true
          upload-pages-artifact: ${{ matrix.arch == 'aarch64' }}
          upload-pages-includes: |
            CNAME
            default.css
            index.html

  # See "Github Pages" below
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: flatter
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## Inputs

The only required input is `files`, which should be a list of paths to Flatpak
manifests (JSON or YAML) to build.

| Name                    | Default   | Description                            |
|-------------------------|-----------|----------------------------------------|
| `files`                 | None      | A list of paths to Flatpak manifests   |
| `arch`                  | `x86_64`  | The architecture to build for          |
| `gpg-sign`              | None      | A GPG Key fingerprint                  |
| `cache-key`             | `flatter` | A cache key, or `''` to disable        |

The `files` input may be either a single-line or multi-line string value:

```yml
# One manifest
files: one.manifestFile.json

# One or more manifests
files: |
  one.manifest.File.json
  two.manifest.File.yml
```

The `arch` input must be set if building for a non-`x86-64` architecture, like
`aarch64`. See [Multiple Architectures](#multiple-architectures) for more
information.

The `gpg-sign` input corresponds to the `--gpg-sign` command-line option and
should be a GPG key fingerprint. See [GPG Signing](#gpg-signing) for more
information.

The `cache-key` input is used as a base to generate cache keys for the
repository and build directories. The key can be rotated if the repository
becomes too large or needs to be reset for some other reason.

### Deployment Options

For more information about deploying Flatter, see [Deployment](#deployment).

| Name                    | Default   | Description                            |
|-------------------------|-----------|----------------------------------------|
| `upload-bundles`        | `false`   | Upload a bundle for each application   |
| `upload-pages-artifact` | `false`   | Upload the repo for GitHub Pages       |
| `upload-pages-includes` | None      | Files to include in GitHub Pages       |

The `upload-bundles` input controls whether a Flatpak bundle will be uploaded
when an application is built. See [Flatpak Bundles](#flatpak-bundles) for more
information.

The `upload-pages-artifact` input controls whether the repository will be
uploaded as a GitHub Pages artifact. See [GitHub Pages](#github-pages) for more
information.

The `upload-pages-includes` input allows including additional files in the
GitHub Pages artifact, such as a `index.html`. See [GitHub Pages](#github-pages)
for more information.

### Test Options

Flatter supports an opinionated test runner, dynamically rewriting Flatpak
manifests to accommodate a testing environment, including a D-Bus session and
X11 server. The intention is that a Flatpak manifest can be passed for testing
in a CI, then passed for distribution as a nightly build if successful.

| Name                    | Default   | Description                            |
|-------------------------|-----------|----------------------------------------|
| `run-tests`             | `false`   | Override for the manifest's value      |
| `test-config-opts`      | None      | Options for `meson setup`              |
| `test-modules`          | None      | Manifest of test dependencies          |

The `run-tests` input overrides the manifest field of the same name, instructing
`flatpak-builder` to run `ninja test` once the project is built. If this input
is `true`, the repository cache will not be used.

The `test-config-opts` input is a list of extra options to pass to `meson setup`
for the target application, used for options like `-Dtests=true`.

The `test-modules` input is a path to a manifest of extra dependencies, relative
to the application manifest. This is a convenient way to keep test dependencies
separate from release dependencies.

### Advanced Options

For advanced use cases, extra command-line options can be passed to `flatpak`
and `flatpak-builder`.

| Name                        | Default | Description                          |
|-----------------------------|---------|--------------------------------------|
| `flatpak-builder-args`      | None    | Options for `flatpak-builder`        |
| `flatpak-build-bundle-args` | None    | Options for `flatpak build-bundle`   |

The `flatpak-builder-args` input is a multi-line string of options to pass to
`flatpak-builder`:

```yml
flatpak-builder-args: |
  --default-branch=nightly
  --skip-if-unchanged
```

The following options are set internally for `flatpak-builder`:

* `--arch`
* `--ccache`
* `--disable-rofiles-fuse`
* `--force-clean`
* `--gpg-sign`
* `--repo`
* `--state-dir`

The `flatpak-build-bundle-args` input is a multi-line string of options to pass
to `flatpak build-bundle`:

```yml
flatpak-build-bundle-args: |
  --runtime-repo=https://platform.io/platform.flatpakrepo
```
  
The following options are set internally for `flatpak build-bundle`:

* `--arch`
* `--gpg-sign`

## Outputs

The only output is `repository`, currently.

| Name                    | Description                                        |
|-------------------------|----------------------------------------------------|
| `repository`            | Absolute path to the Flatpak repository            |

The `repository` output is an absolute path to the repository directory,
corresponding to the `--repo` command-line option.

## Containers
> Feel free to open a pull request for additional runtimes

Flatter provides containers with pre-installed runtimes for several platforms,
built from the base [`Dockerfile`](Dockerfile):

| Image Name               | Version Tags                | Architectures       |
|--------------------------|-----------------------------|---------------------|
| `freedesktop`            | `23.08`, `24.08`            | `x86_64`, `aarch64` |
| `rust`                   | `23.08`, `24.08`            | `x86_64`, `aarch64` |
| `gnome`                  | `46`, `47`, `master`        | `x86_64`, `aarch64` |
| `gnome-rust`             | `46`, `47`                  | `x86_64`, `aarch64` |
| `gnome-typescript`       | `46`, `47`                  | `x86_64`, `aarch64` |
| `gnome-vala`             | `46`, `47`                  | `x86_64`, `aarch64` |
| `kde`                    | `5.15-23.08`, `6.6`, `6.7`  | `x86_64`, `aarch64` |
| `workbench`<sup>1</sup>  | `master`                    | `x86_64`, `aarch64` |

<sup>**1** This is custom container for Workbench, based on GNOME Nightly with
many language extensions installed by default.</sup>

Containers are referenced in the form `ghcr.io/andyholmes/flatter/<image>:<tag>`,
such as `ghcr.io/andyholmes/flatter/gnome:master`:

```yml
name: Flatter

on:
  # Rebuild once a day
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

jobs:
  flatter:
    name: Flatter
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/andyholmes/flatter/gnome:master
      options: --privileged
```

## GPG Signing

> [!TIP]
> If the workflow is intended to be run on pull requests from contributors, be
> sure to add `if: ${{ github.event_name != 'pull_request' }}` to the GPG
> signing step to avoid the job failing.

Flatter supports signing the repository and bundles with GPG. First generate a
GPG key for your repository:

```sh
mkdir flatter
gpg2 --homedir flatter --quick-gen-key username@github.io
```

Export the private key, then add the key and passphrase as GitHub Action secrets
(e.g. `GPG_PRIVATE_KEY` and optionally `GPG_PASSPHRASE`):

```sh
gpg2 --homedir flatter --armor --export-secret-key username@github.io
```

[`crazy-max/ghaction-import-gpg`][gpg-action] can be used to easily import and
preset the passphrase for signing:

```yml
name: Flatter (Signed)

on:
  # Rebuild once a day
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

jobs:
  flatter:
    name: Flatter
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/andyholmes/flatter/gnome:master
      options: --privileged

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup GPG
        # Skip GPG signing for pull requests
        if: ${{ github.event_name != 'pull_request' }}
        id: gpg
        uses: crazy-max/ghaction-import-gpg@v5
        with:
          gpg_private_key: ${{ secrets.GPG_PRIVATE_KEY }}
          passphrase: ${{ secrets.GPG_PASSPHRASE }}

      - name: Build
        uses: andyholmes/flatter@main
        with:
          files: |
            build-aux/flatpak/com.example.App.json
          gpg-sign: ${{ steps.gpg.outputs.fingerprint }}
```

[gpg-action]: https://github.com/crazy-max/ghaction-import-gpg

## Deployment

Flatpak repositories generated by `flatpak-builder` are deployable as static
assets, so deployment is quite flexible.

### Flatpak Bundles

For each manifest built, Flatter can bundle and upload the application as a job
artifact. The artifacts are consistently named in the form
`<application-id>-<architecture>` (e.g. `com.example.App-x86_64`).

Set the `upload-bundles` input to `true` and together with
[nightly.link](https://nightly.link), you can get static links to the most
recent Flatpak bundle built by Flatter.

### GitHub Pages

> [!CAUTION]
> Projects hosted on Github pages may have download speeds throttled if too
> many users are subscribed to the Flatpak repository.

Flatter can upload the repository as an artifact compatible with GitHub Pages,
making the pages for the GitHub repository a Flatpak Repository.

When `upload-pages-artifact` is `true`, Flatter will generate an
`index.flatpakrepo` file in the repository directory, before preparing the
artifact. Other files can be added with the `upload-pages-includes` input
(e.g.`index.html`).

If the current directory includes a `CNAME` file the contents will be used as
the `Url` field, otherwise GitHub's default deployment path will be used
(e.g. `https://andyholmes.github.io/flatter`).

1. Set the `upload-pages-artifact` input to `true`
2. In the **Settings** for the GitHub repository, select **Pages** in the
   sidebar and set **Source** to "GitHub Actions"
3. Add a job with [`actions/deploy-pages`][deploy-pages] to the workflow

```yml
name: Flatter (GitHub Pages)

on:
  # Rebuild once a day
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

jobs:
  flatter:
    name: Flatter
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/andyholmes/flatter/gnome:master
      options: --privileged

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      # Generate a CNAME file in current directory
      - name: Generate CNAME
        run: |
          echo "flatter.andyholmes.ca" > CNAME

      - name: Build
        uses: andyholmes/flatter@main
        with:
          files: |
            build-aux/flatpak/com.example.App.json
          upload-pages-artifact: true
          upload-pages-includes: |
            CNAME
            default.css
            index.html

  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: flatter
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

[deploy-pages]: https://github.com/actions/deploy-pages

### Custom Deploy

The Flatpak repository directory can also be deployed with another action, such
as [`JamesIves/github-pages-deploy-action`][deploy-custom]. The example below
triggers a GitHub Pages deployment by committing the Flatpak repository to the
`gh-pages` branch as the subfolder `/repo`:

```yml
name: Flatter (Deploy)

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  flatter:
    name: Flatter
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/andyholmes/flatter/gnome:master
      options: --privileged
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Build
        id: flatpak
        uses: andyholmes/flatter@main
        with:
          files: |
            build-aux/flatpak/com.example.App.json

      - name: Deploy Repository
        uses: JamesIves/github-pages-deploy-action@releases/v4
        with:
          folder: ${{ steps.flatpak.outputs.repository }}
          target-folder: repo
```

[deploy-custom]: https://github.com/JamesIves/github-pages-deploy-action

## Multiple Architectures

Flatter supports building packages for `x86_64` and `aarch64` using GitHub's
native runners. Currently, each image has runtimes for both architectures
installed.

Multiple architectures can be built in a [job matrix][gh-matrix] or by adding
more jobs, but must not run concurrently if they share a repository directory.
Either use [`max-parallel`][gh-max-parallel] with `matrix` or use a
[`concurrency` group][gh-concurrency].

```yml
name: Flatter

on:
  # Rebuild once a day
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

jobs:
  flatter:
    name: Flatter
    runs-on: ${{ matrix.arch == 'aarch64' && 'ubuntu-24.04-arm' || 'ubuntu-latest' }}
    container:
      image: ghcr.io/andyholmes/flatter/gnome:master
      options: --privileged

    # A matrix can be used, but must set `max-parallel: 1`
    strategy:
      matrix:
        arch: [x86_64, aarch64]
      fail-fast: false
      max-parallel: 1

    steps:
      # Checkout a repository with Flatpak manifests
      - name: Checkout
        uses: actions/checkout@v3

      - name: Build
        uses: andyholmes/flatter@main
        with:
          files: |
            build-aux/flatpak/com.example.App.json
          arch: ${{ matrix.arch }}
```

[gh-concurrency]: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions#concurrency
[gh-matrix]: https://docs.github.com/actions/using-jobs/using-a-matrix-for-your-jobs
[gh-max-parallel]: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstrategymax-parallel

## Acknowledgements

* [Flatpak](https://flatpak.org)
* [`flatpak/flatpak-github-actions`](https://github.com/flatpak/flatpak-github-actions)
* [`crazy-max/ghaction-import-gpg`](https://github.com/crazy-max/ghaction-import-gpg)
* [`JamesIves/github-pages-deploy-action`](https://github.com/JamesIves/github-pages-deploy-action)
