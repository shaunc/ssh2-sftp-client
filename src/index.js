/**
 * ssh2 sftp client for node
 */
'use strict'

const Client = require('ssh2').Client

let SftpClient = function () {
  this.client = new Client()
}

/**
 * Retrieves a directory listing
 *
 * @param {String} path, a string containing the path to a directory
 * @return {Promise} data, list info
 */
SftpClient.prototype.list = async function (path) {
  let reg = /-/gi
  let sftp = this.sftp
  if (!sftp) {
    throw new Error('sftp connect error')
  }
  return new Promise((resolve, reject) => {
    try {
      sftp.readdir(path, (err, list) => {
        if (err) {
          reject(err)
          return false
        }
        // reset file info
        list.forEach((item, i) => {
          list[i] = {
            type: item.longname.substr(0, 1),
            name: item.filename,
            size: item.attrs.size,
            modifyTime: item.attrs.mtime * 1000,
            accessTime: item.attrs.atime * 1000,
            rights: {
              user: item.longname.substr(1, 3).replace(reg, ''),
              group: item.longname.substr(4, 3).replace(reg, ''),
              other: item.longname.substr(7, 3).replace(reg, '')
            },
            owner: item.attrs.uid,
            group: item.attrs.gid
          }
        })
        resolve(list)
      })
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * get file
 *
 * @param {String} path, path
 * @param {Object} useCompression, config options
 * @param {String} encoding. Encoding for the ReadStream, can be
 *   any value supported by node streams. Use 'null' for binary
 *   (https://nodejs.org/api/stream.html#stream_readable_setencoding_encoding)
 * @return {Promise} stream, readable stream
 */
SftpClient.prototype.get = async function (
  path, useCompression, encoding, otherOptions) {
  let options = this.getOptions(useCompression, encoding, otherOptions)
  let sftp = this.sftp
  if (!sftp) {
    throw new Error('sftp connect error')
  }
  return sftp.createReadStream(path, options)
}

/**
 * Create file
 *
 * @param  {String|Buffer|stream} input
 * @param  {String} remotePath,
 * @param  {Object} useCompression [description]
 * @param  {String} encoding. Encoding for the WriteStream, can be any
 *   value supported by node streams.
 * @return {Promise[type]}                [description]
 */
SftpClient.prototype.put = async function (
  input, remotePath, useCompression, encoding, otherOptions) {
  let options = this.getOptions(useCompression, encoding, otherOptions)

  return new Promise((resolve, reject) => {
    let sftp = this.sftp

    if (sftp) {
      if (typeof input === 'string') {
        sftp.fastPut(input, remotePath, options, (err) => {
          if (err) {
            reject(err)
            return false
          }
          resolve()
        })
        return false
      }
      let stream = sftp.createWriteStream(remotePath, options)

      stream.on('error', reject)
      stream.on('close', resolve)

      if (input instanceof Buffer) {
        stream.end(input)
        return false
      }
      input.pipe(stream)
    } else {
      reject(Error('sftp connect error'))
    }
  })
}

SftpClient.prototype.mkdir = async function (path, recursive) {
  recursive = recursive || false
  let sftp = this.sftp
  if (!sftp) {
    throw new Error('sftp connect error')
  }
  return new Promise((resolve, reject) => {
    if (!recursive) {
      try {
        sftp.mkdir(path, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      } catch (err) {
        reject(err)
      }
      return
    }

    let tokens = path.split(/\//g)
    let p = ''

    let mkdir = () => {
      let token = tokens.shift()

      if (!token && !tokens.length) {
        resolve()
        return false
      }
      token += '/'
      p = p + token
      sftp.mkdir(p, (err) => {
        if (err && err.code !== 4) {
          reject(err)
        }
        mkdir()
      })
    }
    return mkdir()
  })
}

SftpClient.prototype.rmdir = async function (path, recursive) {
  recursive = recursive || false
  let sftp = this.sftp
  if (!sftp) {
    throw new Error('sftp connect error')
  }

  return new Promise((resolve, reject) => {
    if (!recursive) {
      try {
        return sftp.rmdir(path, (err) => {
          if (err) {
            return reject(err)
          }
          resolve()
        })
      } catch (err) {
        return reject(err)
      }
    }
    let rmdir = async (p) => {
      let list
      try {
        list = await this.list(p)
      } catch (err) {
        reject(err)
        return
      }
      let promises = []
      list.forEach((item) => {
        let name = item.name
        let promise
        var subPath

        if (name[0] === '/') {
          subPath = name
        } else {
          if (p[p.length - 1] === '/') {
            subPath = p + name
          } else {
            subPath = p + '/' + name
          }
        }

        if (item.type === 'd') {
          if (name !== '.' || name !== '..') {
            promise = rmdir(subPath)
          }
        } else {
          promise = this.delete(subPath)
        }
        promises.push(promise)
      })
      await Promise.all(promises)
      await this.rmdir(p, false)
    }
    return rmdir(path).then(resolve).catch(reject)
  })
}

SftpClient.prototype.delete = async function (path) {
  let sftp = this.sftp
  if (!sftp) {
    throw new Error('sftp connect error')
  }
  return new Promise((resolve, reject) => {
    try {
      sftp.unlink(path, (err) => {
        if (err) {
          reject(err)
          return false
        }
        resolve()
      })
    } catch (err) {
      reject(err)
    }
  })
}

SftpClient.prototype.rename = async function (srcPath, remotePath) {
  let sftp = this.sftp
  if (!sftp) {
    throw new Error('sftp connect error')
  }
  return new Promise((resolve, reject) => {
    try {
      sftp.rename(srcPath, remotePath, (err) => {
        if (err) {
          reject(err)
          return false
        }
        resolve()
      })
    } catch (err) {
      reject(err)
    }
  })
}

SftpClient.prototype.chmod = async function (remotePath, mode) {
  let sftp = this.sftp
  if (!sftp) {
    throw new Error('sftp connect error')
  }
  return new Promise((resolve, reject) => {
    try {
      sftp.chmod(remotePath, mode, (err) => {
        if (err) {
          reject(err)
          return false
        }
        resolve()
      })
    } catch (err) {
      reject(err)
    }
  })
}

SftpClient.prototype.connect = async function (config, connectMethod) {
  connectMethod = connectMethod || 'on'
  return new Promise((resolve, reject) => {
    this.client[connectMethod]('ready', () => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err)
        }
        this.sftp = sftp
        resolve(sftp)
      })
    }).on('error', (err) => {
      console.log('connect error event')
      reject(err)
    }).connect(config)
  })
}

SftpClient.prototype.end = async function () {
  return new Promise((resolve, reject) => {
    this.client.on('close', (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
    this.client.end()
  })
}

SftpClient.prototype.getOptions = function (
  useCompression, encoding, otherOptions) {
  if (encoding === undefined) {
    encoding = 'utf8'
  }
  let options = Object.assign(
    {}, otherOptions || {}, {encoding: encoding}, useCompression)
  return options
}

// add Event type support
SftpClient.prototype.on = function (eventType, callback) {
  this.client.on(eventType, callback)
}
SftpClient.prototype.once = function (eventType, callback) {
  this.client.once(eventType, callback)
}
SftpClient.prototype.removeListener = function (eventType, callback) {
  this.client.removeListener(eventType, callback)
}
SftpClient.prototype.removeAllListeners = function (eventType) {
  this.client.removeAllListeners(eventType)
}

module.exports = SftpClient
