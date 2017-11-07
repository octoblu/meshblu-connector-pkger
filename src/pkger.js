const fs = require("fs-extra")
const path = require("path")
const Promise = require("bluebird")
const { exec } = require("child_process")
const pkgExec = require("pkg").exec
const glob = Promise.promisify(require("glob"))
const defaultsDeep = require("lodash.defaultsdeep")
const debug = require("debug")("meshblu-connector-pkger")

class MeshbluConnectorPkger {
  constructor({ target, connectorPath, spinner, nodeVersion, maxOldSpaceSize }) {
    this.nodeVersion = nodeVersion
    this.packageJSON = fs.readJsonSync(path.join(connectorPath, "package.json"))
    this.connectorPath = connectorPath
    this.maxOldSpaceSize = maxOldSpaceSize
    this.target = target || this.getTarget()
    process.env.MESHBLU_CONNECTOR_TARGET = this.target
    this.type = this.packageJSON.name
    this.spinner = spinner
    this.deployPath = path.join(this.connectorPath, "deploy", this.target, "bin")
  }

  exec(cmd, options) {
    options = options || {}
    if (process.platform === "linux" && process.arch === "arm") options.shell = "/bin/bash"
    return new Promise((resolve, reject) => {
      let interval = setInterval(function() {
        debug("still processing...")
      }, 30 * 1000)
      exec(cmd, options, (error, stdout, stderr) => {
        debug("stdout:", stdout)
        debug("stderr:", stderr)
        clearInterval(interval)
        if (error) {
          error.stdout = stdout
          error.stderr = stderr
          return reject(error)
        }
        return resolve()
      })
    })
  }

  getTarget() {
    let { arch, platform } = process
    if (platform === "darwin") platform = "macos"
    if (platform === "win32") platform = "win"
    if (arch === "ia32") arch = "x86"
    if (arch === "arm") arch = "armv7"

    return `node${this.nodeVersion}-${platform}-${arch}`
  }

  getExtension() {
    if (process.platform === "win32") return ".exe"
    return ""
  }

  ensurePath() {
    return fs.ensureDir(this.deployPath)
  }

  package() {
    return this.yarn()
      .then(() => this.ensurePath())
      .then(() => this.build())
      .then(() => this.dotnode())
      .then(() => this.pkg())
      .then(() => this.afterBuild())
      .then(() => this.dotenv())
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
    debug("running yarn build")
    const options = {
      cwd: this.connectorPath,
      env: process.env,
    }
    if (this.packageJSON.scripts.build == null) {
      debug("package.json is missing build script, skipping...")
      return Promise.resolve()
    }
    return this.exec("yarn build", options)
  }

  afterBuild() {
    this.spinner.color = "green"
    this.spinner.text = "After Building..."
    debug("running yarn build:after")
    const options = {
      cwd: this.connectorPath,
      env: process.env,
    }
    if (this.packageJSON.scripts["build:after"] == null) {
      debug("package.json is missing build:after script, skipping...")
      return Promise.resolve()
    }
    return this.exec("yarn build:after", options)
  }

  dotenv() {
    this.spinner.color = "green"
    this.spinner.text = "Copying .env..."
    debug("copy _env to bin/.env")
    const source = path.resolve("./_env")
    const dest = path.join(this.deployPath, ".env")
    return fs.pathExists(source).then(exists => {
      if (!exists) return Promise.resolve()
      return fs.copy(source, dest)
    })
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
    return glob(`${nodeModulesPath}/**/Release/*.node`, {
      nodir: true,
    }).map(file => {
      debug("found .node file", { file })
      return this.copyToDeploy(file)
    })
  }

  pkg() {
    this.spinner.color = "green"
    this.spinner.text = "Making that pkg"
    debug("making pkg")
    const srcConfig = path.join(__dirname, "..", "config.json")
    const destConfig = path.join(this.connectorPath, "pkg-config.json")
    const bin = this.packageJSON.bin
    let bins = {}
    if (typeof bin === "string") {
      bins[this.type] = bin
    } else {
      bins = bin
    }

    bins = bins || {}

    if (!bins[this.type]) return Promise.reject(new Error(`meshblu-connector-pkger requires "bin" entry in package.json for ${this.type}`))

    return this.copyPkgConfig({ srcConfig, destConfig }).then(() => {
      return Promise.each(Object.keys(bins), key => {
        const outputFile = path.join(this.deployPath, key + this.getExtension())
        const file = path.resolve(bins[key])
        const args = ["--config", destConfig, "--target", this.target, "--output", outputFile, file]
        if (this.maxOldSpaceSize) {
          args.unshift("--options", `max_old_space_size=${this.maxOldSpaceSize}`)
        }
        if (require("debug")("pkg").enabled) {
          args.unshift("--debug")
        }
        debug("building pkg with", args)
        return pkgExec(args)
      })
    })
  }

  copyPkgConfig({ srcConfig, destConfig }) {
    const pkgOptions = this.packageJSON.pkg
    const srcOptions = fs.readJsonSync(srcConfig)
    const data = defaultsDeep(pkgOptions, srcOptions)
    debug('pkg-config.json', JSON.stringify(data, null, 2))
    return fs.writeJson(destConfig, data, { spaces: 2 })
  }
}

module.exports.MeshbluConnectorPkger = MeshbluConnectorPkger
