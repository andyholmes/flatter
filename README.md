# Flatter

Flatter is a GitHub Action for building and hosting a Flatpak repository in a
static hosting environment, such as GitHub Pages.

## Table of Contents

* [Complete Example](#complete-example)
* [Inputs](#inputs)
  * [Deployment Options](#deployment-options)
  * [Advanced Options](#advanced-options)
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
      image: ghcr.io/andyholmes/flatter/gnome:43
      options: --privileged

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

      # See "Multiple Architectures"
      - name: Setup QEMU
        if: ${{ matrix.arch == 'aarch64' }}
        id: qemu
        uses: docker/setup-qemu-action@v2
        with:
          platforms: arm64

      # See "GPG Signing" below
      - name: Setup GPG
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
          include-files: |
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
        uses: actions/deploy-pages@v1
```

## Inputs

The only required input is `files`, which should be a list of paths to Flatpak
manifests (JSON or YAML) to build.

| Name                    | Default   | Description                            |
|-------------------------|-----------|----------------------------------------|
| `files`                 | None      | A list of paths to Flatpak manifests   |
| `arch`                  | `x86_64`  | The architecture to build for          |
| `gpg-sign`              | None      | A GPG Key fingerprint                  |
| `repo`                  | `repo`    | The path to export the repository      |
| `cache-key`             | `flatter` | A cache key, or `''` to disable        |

### Deployment Options

For more information, see [Deployment](#deployment).

| Name                    | Default   | Description                            |
|-------------------------|-----------|----------------------------------------|
| `upload-bundles`        | `false`   | Upload a bundle for each application   |
| `upload-pages-artifact` | `false`   | Upload the repo for GitHub Pages       |
| `include-files`         | None      | Files to include in the repository     |


### Advanced Options

For advanced use cases, Flatter offers an input for each command-line program
used.

| Name                        | Description                                    |
|-----------------------------|------------------------------------------------|
| `flatpak-builder-args`      | Command-line options for `flatpak-builder`     |
| `flatpak-build-bundle-args` | Upload the repo for GitHub Pages               |

Flatter sets the following flags for `flatpak-builder` internally:
  
```sh
--arch
--ccache
--disable-rofiles-fuse
--gpg-sign
--repo
--state-dir
```
  
Flatter sets the following flags for `flatpak build-bundle` internally:
  
```sh
--arch
--gpg-sign
```

## Containers

Flatter provides containers with pre-installed runtimes for several platforms,
built from the base [`Dockerfile`](Dockerfile):

| Name          | Versions (tags)                        | Architectures       |
|---------------|----------------------------------------|---------------------|
| `freedesktop` | `21.08`, `22.08`                       | `x86_64`, `aarch64` |
| `gnome`       | `42`, `43`, `master`                   | `x86_64`, `aarch64` |
| `kde`         | `5.15-21.08`, `5.15-22.08`             | `x86_64`, `aarch64` |
| `elementary`  | `juno-20.08`                           | `x86_64`            |

## GPG Signing

Flatter supports signing the repository and bundles with GPG. First generate a
GPG key for your repository:

```sh
mkdir flatter
gpg2 --homedir flatter --quick-gen-key username@github.io
```

Export the private key, then add the key and passphrase as GitHub Action secrets
(e.g. `GPG_PRIVATE_KEY` and `GPG_PASSPHRASE`):

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
      image: ghcr.io/andyholmes/flatter/gnome:43
      options: --privileged

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup GPG
        id: gpg
        uses: crazy-max/ghaction-import-gpg@v5
        with:
          gpg_private_key: ${{ secrets.GPG_PRIVATE_KEY }}
          passphrase: ${{ secrets.GPG_PASSPHRASE }}

      - name: Build
        uses: andyholmes/actions/flatter@main
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

Flatter can upload the repository as an artifact compatible with GitHub Pages,
making the pages for the GitHub repository a Flatpak Repository. Flutter will
generate an `index.flatpakrepo` file in the repository directory and other files
can be added with the `include-files` input (e.g.`index.html`).

1. Set the `upload-pages-artifact` input to `true`
2. In the **Settings** for the GitHub repository, select **Pages** in the
   sidebar and set **Source** to "GitHub Pages"
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
      image: ghcr.io/andyholmes/flatter/gnome:43
      options: --privileged

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Build
        uses: andyholmes/actions/flatter@main
        with:
          files: |
            build-aux/flatpak/com.example.App.json
          upload-pages-artifact: true
          include-files: |
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
        uses: actions/deploy-pages@v1
```

[deploy-pages]: https://github.com/actions/deploy-pages

### Custom Deploy

The Flatpak repository directory can also be deployed with another action, such
as [`JamesIves/github-pages-deploy-action`][deploy-custom]. The example below
deploys the Flatpak repository in the subfolder `/repo`, without disturbing
other files in the deployment environment:

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
      image: ghcr.io/andyholmes/flatter/gnome:43
      options: --privileged
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Build
        uses: andyholmes/actions/flatter@main
        with:
          files: |
            build-aux/flatpak/com.example.App.json
          repo: repo

      - name: Deploy Repository
        uses: JamesIves/github-pages-deploy-action@releases/v4
        with:
          folder: repo
          target-folder: repo
```

[deploy-custom]: https://github.com/JamesIves/github-pages-deploy-action

## Multiple Architectures

Flatter support building repositories with multiple architectures, such as
`x86_64` for desktop and `aarch64` for mobile devices.

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
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/andyholmes/flatter/gnome:43
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

      # See "Multiple Architectures"
      - name: Setup QEMU
        if: ${{ matrix.arch == 'aarch64' }}
        id: qemu
        uses: docker/setup-qemu-action@v2
        with:
          platforms: arm64

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
