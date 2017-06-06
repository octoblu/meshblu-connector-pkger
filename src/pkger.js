const path = require("path")
const util = require("util")
const exec = util.promisify(require("child_process").exec)
const glob = util.promisify(require("glob"))
const { mkdirp, copy } = require("fs-extra")
const writeFile = util.promisify(require("fs").writeFile)

class MeshbluConnectorPkger {
  constructor({ connectorPath, type, spinner }) {
    this.connectorPath = connectorPath
    this.type = type
    this.spinner = spinner
    this.deployPath = path.join(connectorPath, "deploy")
  }

  package() {
    return this.yarn()
      .then(() => {
        return mkdirp(this.deployPath)
      })
      .then(() => {
        return this.dotnode()
      })
      .then(() => {
        return this.mutatePackageJSON()
      })
      .then(() => {
        return this.build()
      })
      .then(() => {
        return this.pkg()
      })
  }

  async yarn() {
    this.spinner.color = "blue"
    this.spinner.text = "Yarn-ing it up"
    const options = {
      cwd: this.connectorPath,
    }
    await exec(`yarn install --check-files --force`, options)
  }

  async build() {
    this.spinner.color = "green"
    this.spinner.text = "De-coffeeeeeing..."
    const options = {
      cwd: this.connectorPath,
    }
    await exec(`yarn build`, options)
  }

  mutatePackageJSON() {
    let packageJSON = require(path.join(this.connectorPath, "package.json"))
    let pkgJSON = require(path.join(__dirname, "../config.json"))
    packageJSON.pkg = pkgJSON.pkg
    return writeFile(path.join(this.connectorPath, "package.json"), JSON.stringify(packageJSON, null, 2))
  }

  copyToDeploy(file) {
    const basename = path.basename(file)
    const destFilename = path.join(this.deployPath, basename)
    return copy(file, destFilename)
  }

  dotnode() {
    this.spinner.color = "blue"
    this.spinner.text = "Finding those pesky .node files"
    const nodeModulesPath = path.join(this.connectorPath, "node_modules")
    var promises = []
    glob(`${nodeModulesPath}/**/Release/*.node`).then(files => {
      files.forEach(file => {
        promises.push(this.copyToDeploy(file))
      })
    })

    return Promise.all(promises)
  }

  async pkg() {
    this.spinner.color = "green"
    this.spinner.text = "Making that pkg"
    const options = {
      cwd: this.connectorPath,
    }
    let { arch, platform } = process
    if (platform === "darwin") platform = "macos"
    if (platform === "win32") platform = "win"
    if (arch === "ia32") arch = "x86"
    if (arch === "arm") arch = "armv7"

    const nodeVersion = "8"
    const target = `node${nodeVersion}-${platform}-${arch}`
    const pkg = path.join(__dirname, "../node_modules/.bin/pkg")
    const outputFile = path.join(this.deployPath, this.type)
    const cmd = `${pkg} --target ${target} --output ${outputFile} .`
    await exec(cmd, options)
  }
}

module.exports.MeshbluConnectorPkger = MeshbluConnectorPkger
