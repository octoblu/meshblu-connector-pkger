const fs = require("fs-extra")
const path = require("path")
const Promise = require("bluebird")
const exec = Promise.promisify(require("child_process").exec)
const glob = Promise.promisify(require("glob"))

class MeshbluConnectorPkger {
  constructor({ target, connectorPath, spinner }) {
    this.packageJSON = fs.readJsonSync(path.join(connectorPath, "package.json"))
    this.connectorPath = path.resolve(connectorPath)
    this.target = target || this.getTarget()
    this.type = this.packageJSON.name
    this.spinner = spinner
    this.deployPath = path.join(this.connectorPath, "deploy", "bin")
  }

  getTarget() {
    let { arch, platform } = process
    if (platform === "darwin") platform = "macos"
    if (platform === "win32") platform = "win"
    if (arch === "ia32") arch = "x86"
    if (arch === "arm") arch = "armv7"

    const nodeVersion = "8"
    return `node${nodeVersion}-${platform}-${arch}`
  }

  package() {
    return this.yarn()
      .then(() => {
        return fs.mkdirp(this.deployPath)
      })
      .then(() => {
        return this.dotnode()
      })
      .then(() => {
        return this.build()
      })
      .then(() => {
        return this.pkg()
      })
  }

  yarn() {
    this.spinner.color = "blue"
    this.spinner.text = "Yarn-ing it up"
    const options = {
      cwd: this.connectorPath,
    }
    return exec(`yarn install --check-files --force --ignore-scripts; npm rebuild --arch=arm --target_arch=arm`, options)
  }

  build() {
    this.spinner.color = "green"
    this.spinner.text = "De-coffeeeeeing..."
    const options = {
      cwd: this.connectorPath,
    }
    return exec(`yarn build || exit 0`, options)
  }

  copyToDeploy(file) {
    const basename = path.basename(file)
    const destFilename = path.join(this.deployPath, basename)
    return fs.copy(file, destFilename)
  }

  dotnode() {
    this.spinner.color = "blue"
    this.spinner.text = "Finding those pesky .node files"
    const nodeModulesPath = path.join(this.connectorPath, "node_modules")
    return glob(`${nodeModulesPath}/**/Release/*.node`, { nodir: true }).map(file => {
      return this.copyToDeploy(file)
    })
  }

  pkg() {
    this.spinner.color = "green"
    this.spinner.text = "Making that pkg"
    const options = {
      cwd: this.connectorPath,
    }
    const pkg = path.join(__dirname, "../node_modules/.bin/pkg")
    const config = path.join(__dirname, "..", "config.json")
    const bin = this.packageJSON.bin
    const bins = {}
    if (typeof bin === "string") bins[this.type] = bin

    if (!bins[this.type]) return Promise.reject(new Error('meshblu-connector-pkger requires "bin" entry in package.json'))

    return Promise.map(Object.keys(bins), key => {
      const outputFile = path.join(this.deployPath, key)
      const file = bins[key]
      const cmd = `${pkg} --config ${config} --target ${this.target} --output ${outputFile} ./${file}`
      return exec(cmd, options)
    })
  }
}

module.exports.MeshbluConnectorPkger = MeshbluConnectorPkger
