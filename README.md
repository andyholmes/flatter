# Flatter

Flatter is a GitHub Action for building and hosting a Flatpak repository in a
static hosting environment, such as GitHub Pages.

## Example

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

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      # See "GPG Signing" below
      - name: Setup GPG
        id: gpg
        uses: crazy-max/ghaction-import-gpg@v5
        with:
          gpg_private_key: ${{ secrets.GPG_PRIVATE_KEY }}
          passphrase: ${{ secrets.GPG_PASSPHRASE }}

      - name: Build
        uses: andyholmes/actions/flatter@main
        with:
          manifests: |
            com.example.App.json
          gpg-sign: ${{ steps.gpg.outputs.fingerprint }}
          pages-artifact: true
          bundle-artifact: true
```

### Inputs

#### Action Inputs

| Name              | Default | Description                                |
|-------------------|---------|--------------------------------------------|
| `manifests`       | None    | A list of manifests to build               |
| `pages-artifact`  | `false` | Upload the repo as a GitHub Pages artifact |
| `bundle-artifact` | `false` | Whether to upload Flatpak artifacts        |

#### Flatpak Inputs

| Name                | Default  | Description                                |
|---------------------|----------|--------------------------------------------|
| `arch`              | `x86_64` | The architecture to build for              |
| `default-branch`    | None     | The branch to use when exporting           |
| `gpg-sign`          | None     | A GPG Key fingerprint                      |
| `gpg-homedir`       | None     | A directory to look for GPG keys           |
| `install-deps-from` | None     | A directory to look for GPG keys           |
| `repo`              | `repo`   | The repository directory                   |


### GPG Signing

Flatter supports signing the repository and bundles with GPG. First generate a
GPG key for your repository:

```sh
mkdir flatter
gpg2 --homedir flatter --quick-gen-key username@github.io
```

Export the private key, then add the key and passphrase as GitHub Action secrets
(e.g. `GPG_PRIVATE_KEY` and `GPG_PASSPHRASE`):

```sh
gpg --homedir flatter --armor --export-secret-key username@github.io
```

[crazy-max/ghaction-import-gpg][gpg-action] can be used to easily import and
preset the passphrase for signing:

```yml
name: Flatter (Signed)

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
          manifests: |
            com.example.App.json
          gpg-sign: ${{ steps.gpg.outputs.fingerprint }}
```

[gpg-action]: https://github.com/crazy-max/ghaction-import-gpg

### Custom Deploy

The Flatpak repository directory can also be deployed with a custom method, such
as [JamesIves/github-pages-deploy-action][deploy-action]:

```yml
name: Flatter (Test)

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

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Build
        uses: andyholmes/actions/flatter@main
        with:
          manifests: |
            com.example.App.json
          repo: repo

      - name: Deploy Repository
        uses: JamesIves/github-pages-deploy-action@releases/v4
        with:
          folder: repo
          target-folder: flatpak
```

[deploy-action]: https://github.com/JamesIves/github-pages-deploy-action
