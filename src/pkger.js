const fs = require("fs-extra")
const path = require("path")
const Promise = require("bluebird")
const exec = require("child_process").exec
const glob = Promise.promisify(require("glob"))
const defaultsDeep = require("lodash.defaultsdeep")
const debug = require("debug")("meshblu-connector-pkger")

class MeshbluConnectorPkger {
  constructor({ target, connectorPath, spinner }) {
    this.packageJSON = fs.readJsonSync(path.join(connectorPath, "package.json"))
    this.connectorPath = connectorPath
    this.target = target || this.getTarget()
    this.type = this.packageJSON.name
    this.spinner = spinner
    this.deployPath = path.join(this.connectorPath, "deploy", this.target, "bin")
  }

  exec(cmd, options) {
    options = options || {}
    if (process.platform === "linux" && process.arch === "arm") options.shell = "/bin/bash"
    return new Promise((resolve, reject) => {
      exec(cmd, options, (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout
          error.stderr = stderr
          return reject(error)
        }
        return resolve(stdout, stderr)
      })
    })
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

  getExtension() {
    if (process.platform === "win32") return ".exe"
    return ""
  }

  ensurePath() {
    return fs.ensureDir(this.deployPath)
  }

  package() {
    return this.yarn().then(() => this.ensurePath()).then(() => this.dotnode()).then(() => this.build()).then(() => this.pkg())
  }

  yarn() {
    this.spinner.color = "blue"
    this.spinner.text = "Yarn-ing it up"
    debug("yarn it up")
    const options = {
      cwd: this.connectorPath,
      env: process.env,
    }
    return this.exec("yarn install --check-files --force", options)
  }

  build() {
    this.spinner.color = "green"
    this.spinner.text = "Building..."
    debug("runing yarn build")
    const options = {
      cwd: this.connectorPath,
      env: process.env,
    }
    return this.exec("yarn build || exit 0", options)
  }

  copyToDeploy(file) {
    const basename = path.basename(file)
    const destFilename = path.join(this.deployPath, basename)
    return fs.copy(file, destFilename)
  }

  dotnode() {
    this.spinner.color = "blue"
    this.spinner.text = "Finding those pesky .node files"
    debug("finding those pesky .node files")
    const nodeModulesPath = path.join(this.connectorPath, "node_modules")
    return glob(`${nodeModulesPath}/**/Release/*.node`, { nodir: true }).map(file => {
      debug("found .node file", { file })
      return this.copyToDeploy(file)
    })
  }

  pkg() {
    this.spinner.color = "green"
    this.spinner.text = "Making that pkg"
    debug("making pkg")
    const pkg = path.join(__dirname, "../node_modules/.bin/pkg")
    const srcConfig = path.join(__dirname, "..", "config.json")
    const destConfig = path.join(this.connectorPath, "pkg-config.json")
    const bin = this.packageJSON.bin
    let bins = {}
    if (typeof bin === "string") {
      bins[this.type] = bin
    } else {
      bins = bin
    }

    if (!bins[this.type]) return Promise.reject(new Error(`meshblu-connector-pkger requires "bin" entry in package.json for ${this.type}`))

    return this.copyPkgConfig({ srcConfig, destConfig }).then(() => {
      return Promise.each(Object.keys(bins), key => {
        const outputFile = path.join(this.deployPath, key + this.getExtension())
        const file = path.resolve(bins[key])
        const cmd = `${pkg} --config ${destConfig} --target ${this.target} --output ${outputFile} ${file}`
        const options = {
          cwd: this.connectorPath,
          env: process.env,
        }
        return this.exec(cmd, options)
      })
    })
  }

  copyPkgConfig({ srcConfig, destConfig }) {
    const pkgOptions = this.packageJSON.pkg
    const srcOptions = fs.readJsonSync(srcConfig).pkg
    const data = defaultsDeep(pkgOptions, srcOptions)
    return fs.writeJson(destConfig, { pkg: data })
  }
}

module.exports.MeshbluConnectorPkger = MeshbluConnectorPkger
