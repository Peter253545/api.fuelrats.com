'use strict'

let _ = require('underscore')
let db = require('../db').db
let Rat = require('../db').Rat
let Rescue = require('../db').Rescue
let Epic = require('../db').Epic
let API = require('../classes/API')
let RescueQuery = require('../Query/RescueQuery')
let RescueResult = require('../Results/rescue')

let Errors = require('../errors')
let Permission = require('../permission')

class Rescues {
  static search (params, connection) {
    return new Promise(function (resolve, reject) {
      Rescue.findAndCountAll(new RescueQuery(params, connection).toSequelize).then(function (result) {
        resolve(new RescueResult(result, params).toResponse())
      }).catch(function (error) {
        reject(Errors.throw('server_error', error.message))
      })
    })
  }

  static create (params, connection, data) {
    return new Promise(function (resolve, reject) {
      Rescue.create(data).then(function (rescue) {
        if (!rescue) {
          return reject(Errors.throw('operation_failed'))
        }

        resolve(new RescueResult(rescue, params).toResponse())
      }).catch(function (error) {
        reject(Errors.throw('server_error', error.message))
      })
    })
  }
}

class Controller {

  static update (data, connection, query) {
    return new Promise(function (resolve, reject) {
      if (query.id) {
        findRescueWithRats({ id: query.id }).then(function (rescue) {
          if (!rescue) {
            reject({ error: Error.throw('not_found', rescue.id), meta: {} })
          }

          // If the rescue is closed or the user is not involved with the rescue, we will require moderator permission
          let permission = getRescuePermissionType(rescue, connection.user)
          Permission.require(permission, connection.user).then(function () {
            let updates = []

            if (data.rats) {
              for (let ratId of data.rats) {
                updates.push(rescue.addRat(ratId))
              }
              delete data.rats
            }

            if (data.firstLimpet) {
              let firstLimpet = data.firstLimpet
              updates.push(rescue.setFirstLimpet(firstLimpet))
              delete data.firstLimpet
            }

            if (Object.keys(data).length > 0) {
              updates.push(Rescue.update(data, {
                where: { id: rescue.id }
              }))
            }

            Promise.all(updates).then(function () {
              findRescueWithRats({ id: query.id }).then(function (rescueInstance) {
                if (!rescueInstance) {
                  reject({ error: Error.throw('operation_failed'), meta: {} })
                  return
                }

                let rescue = convertRescueToAPIResult(rescueInstance)

                let allClientsExcludingSelf = connection.websocket.socket.clients.filter(function (cl) {
                  return cl.clientId !== connection.clientId
                })
                connection.websocket.broadcast(allClientsExcludingSelf, {
                  action: 'rescue:updated'
                }, rescue)

                resolve({
                  data: rescue,
                  meta: {}
                })

                resolve({ data: rescue, meta: {} })
              }).catch(function (error) {
                reject({ error: Errors.throw('server_error', error), meta: {} })
              })
            }).catch(function (error) {
              reject({ error: Errors.throw('server_error', error), meta: {} })
            })
          }, function (error) {
            reject({ error: error })
          })
        }, function (error) {
          reject({ error: Errors.throw('server_error', error), meta: {} })
        })
      } else {
        reject({ error: Errors.throw('missing_required_field', 'id'), meta: {} })
      }
    })
  }

  static delete (data, connection, query) {
    return new Promise(function (resolve, reject) {
      if (query.id) {
        Permission.require('rescue.delete', connection.user).then(function () {
          Rescue.findById(query.id).then(function (rescue) {
            if (!rescue) {
              reject({ error: Errors.throw('not_found', query.id), meta: {} })
              return
            }
            rescue.destroy()

            let allClientsExcludingSelf = connection.websocket.socket.clients.filter(function (cl) {
              return cl.clientId !== connection.clientId
            })
            connection.websocket.broadcast(allClientsExcludingSelf, {
              action: 'rescue:deleted'
            }, { id: query.id })

            resolve({ data: null, meta: {} })
          }).catch(function (error) {
            reject({ error: Errors.throw('server_error', error), meta: {} })
          })
        }).catch(function (error) {
          reject({ error: error })
        })
      } else {
        reject({ error: Errors.throw('missing_required_field', 'id'), meta: {} })
      }
    })
  }

  static assign (data, connection, query) {
    return new Promise(function (resolve, reject) {
      if (query.id) {
        findRescueWithRats({ id: query.id }).then(function (rescue) {
          if (!rescue) {
            reject({ error: Error.throw('not_found', rescue.id), meta: {} })
            return
          }
          // If the rescue is closed or the user is not involved with the rescue, we will require moderator permission
          let permission = getRescuePermissionType(rescue, connection.user)

          Permission.require(permission, connection.user).then(function () {
            Rat.findById(data.ratId).then(function (rat) {
              rescue.addRat(rat).then(function () {
                findRescueWithRats({ id: query.id }).then(function (rescueInstance) {
                  if (!rescueInstance) {
                    reject({ error: Error.throw('operation_failed'), meta: {} })
                    return
                  }
                  let rescue = convertRescueToAPIResult(rescueInstance)

                  let allClientsExcludingSelf = connection.websocket.socket.clients.filter(function (cl) {
                    return cl.clientId !== connection.clientId
                  })
                  connection.websocket.broadcast(allClientsExcludingSelf, {
                    action: 'rescue:updated'
                  }, rescue)

                  resolve({
                    data: rescue,
                    meta: {
                      id: query.id
                    }
                  })
                }).catch(function (error) {
                  reject({ error: Errors.throw('server_error', error), meta: {} })
                })
              }).catch(function (error) {
                reject({ error: Errors.throw('server_error', error), meta: {} })
              })
            }).catch(function (error) {
              reject({ error: Errors.throw('server_error', error), meta: {} })
            })
          }, function (error) {
            reject({ error: error })
          })
        }, function (error) {
          reject({ error: Errors.throw('server_error', error), meta: {} })
        })
      } else {
        reject({ error: Errors.throw('missing_required_field', 'id'), meta: {} })
      }
    })
  }

  static unassign (data, connection, query) {
    return new Promise(function (resolve, reject) {
      if (query.id) {
        findRescueWithRats({ id: query.id }).then(function (rescue) {
          if (!rescue) {
            reject({ error: Error.throw('not_found', rescue.id), meta: {} })
            return
          }
          // If the rescue is closed or the user is not involved with the rescue, we will require moderator permission
          let permission = getRescuePermissionType(rescue, connection.user)

          Permission.require(permission, connection.user).then(function () {
            Rat.findById(data.ratId).then(function (rat) {
              rescue.removeRat(rat).then(function () {
                findRescueWithRats({ id: query.id }).then(function (rescueInstance) {
                  if (!rescueInstance) {
                    reject({ error: Error.throw('operation_failed'), meta: {} })
                    return
                  }
                  let rescue = convertRescueToAPIResult(rescueInstance)

                  let allClientsExcludingSelf = connection.websocket.socket.clients.filter(function (cl) {
                    return cl.clientId !== connection.clientId
                  })
                  connection.websocket.broadcast(allClientsExcludingSelf, {
                    action: 'rescue:updated'
                  }, rescue)

                  resolve({
                    data: rescue,
                    meta: {}
                  })
                }).catch(function (error) {
                  reject({ error: Errors.throw('server_error', error), meta: {} })
                })
              }).catch(function (error) {
                reject({ error: Errors.throw('server_error', error), meta: {} })
              })
            }).catch(function (error) {
              reject({ error: Errors.throw('server_error', error), meta: {} })
            })
          }, function (error) {
            reject({ error: error })
          })
        }, function (error) {
          reject({ error: Errors.throw('server_error', error), meta: {} })
        })
      } else {
        reject({ error: Errors.throw('missing_required_field', 'id'), meta: {} })
      }
    })
  }

  static addquote (data, connection, query) {
    return new Promise(function (resolve, reject) {
      if (query.id) {
        findRescueWithRats({ id: query.id }).then(function (rescue) {if (!rescue) {
          reject({ error: Error.throw('not_found'), meta: {} })
          return
        }
          // If the rescue is closed or the user is not involved with the rescue, we will require moderator permission
          let permission = getRescuePermissionType(rescue, connection.user)

          Permission.require(permission, connection.user).then(function () {
            let updatedQuotes = rescue.quotes.concat(data)
            Rescue.update(
              {
                quotes: updatedQuotes
              }, {
                where: { id: rescue.id }
              }).then(function () {
                findRescueWithRats({ id: query.id }).then(function (rescueInstance) {
                  if (!rescueInstance) {
                    reject({ error: Error.throw('operation_failed', rescue.id), meta: {} })
                    return
                  }
                  let rescue = convertRescueToAPIResult(rescueInstance)

                  let allClientsExcludingSelf = connection.websocket.socket.clients.filter(function (cl) {
                    return cl.clientId !== connection.clientId
                  })
                  connection.websocket.broadcast(allClientsExcludingSelf, {
                    action: 'rescue:updated'
                  }, rescue)
                  resolve({ data: rescue, meta: {} })
                }).catch(function (error) {
                  reject({ error: Errors.throw('server_error', error), meta: {} })
                })
              }).catch(function (error) {
                reject({ error: Errors.throw('server_error', error), meta: {} })
              }
            )
          }, function (error) {
            reject({ error: error })
          })
        }, function (error) {
          reject({ error: Errors.throw('server_error', error), meta: {} })
        })
      } else {
        reject({ error: Errors.throw('missing_required_field', 'id'), meta: {} })
      }
    })
  }
}

class HTTP {
  static assign (request, response, next) {
    response.model.meta.params = _.extend(response.model.meta.params, request.params)

    Controller.assign(request.params, request, request.params).then(function (data) {
      response.model.data = data.data
      response.status(200)
      next()
    }).catch(function (error) {
      response.model.errors.push(error.error)
      response.status(error.error.code)
      next()
    })
  }

  static unassign (request, response, next) {
    response.model.meta.params = _.extend(response.model.meta.params, request.params)

    Controller.unassign(request.params, request, request.params).then(function (data) {
      response.model.data = data.data
      response.status(200)
      next()
    }).catch(function (error) {
      response.model.errors.push(error.error)
      response.status(error.error.code)
      next()
    })
  }

  static addquote (request, response, next) {
    response.model.meta.params = _.extend(response.model.meta.params, request.params)
    Controller.addquote(request.body.quotes, request, request.params).then(function (data) {
      response.model.data = data.data
      response.status(200)
      next()
    }, function (error) {
      response.model.errors.push(error.error)
      response.status(error.error.code)
      next()
    })
  }

  static get (request, response, next) {
    Controller.read(request.query, request).then(function (res) {
      let data = res.data
      let meta = res.meta

      response.model.data = data
      response.model.meta = meta
      response.status = 400
      next()
    }).catch(function (error) {
      response.model.errors.push(error.error)
      response.status(error.error.code)
      next()
    })
  }

  static getById (request, response, next) {
    response.model.meta.params = _.extend(response.model.meta.params, request.params)
    let id = request.params.id

    if (id) {
      Rescue.findOne({
        where: { id: id },
        include: [
          {
            model: Rat,
            as: 'rats',
            required: false
          },
          {
            model: Rat,
            as: 'firstLimpet',
            required: false
          },
          {
            model: Epic,
            as: 'epics',
            required: false
          }
        ]
      }).then(function (rescueInstance) {
        if (request.query.v === '2') {
          response.model.data = rescueInstance.toJSON()
        } else {
          response.model.data = convertRescueToAPIResult(rescueInstance)
        }
        response.status(200)
        next()
      }).catch(function (error) {
        response.model.errors.push(error)
        response.status(400)
        next()
      })
    }
  }

  static post (request, response, next) {
    Controller.create(request.body, request).then(function (res) {
      response.model.data = res.data
      response.status(201)
      next()
    }, function (error) {
      response.model.errors.push(error)
      response.status(400)
      next()
    })
  }

  static put (request, response, next) {
    response.model.meta.params = _.extend(response.model.meta.params, request.params)

    Controller.update(request.body, request, request.params).then(function (data) {
      response.model.data = data.data
      response.status(201)
      next()
    }).catch(function (error) {
      response.model.errors.push(error)
      response.status(error.error.code)
      next()
    })
  }

  static delete (request, response, next) {
    response.model.meta.params = _.extend(response.model.meta.params, request.params)

    Controller.delete(request.body, request, request.params).then(function () {
      response.status(204)
      next()
    }).catch(function (error) {
      response.model.errors.push(error)
      response.status(error.error.code)
      next()
    })
  }
}

function getRescuePermissionType (rescue, user) {
  if (rescue.open === true) {
    return 'self.rescue.update'
  }

  if (rescue.createdAt - Date.now() < 3600000) {
    return 'self.rescue.update'
  }

  if (user) {
    for (let CMDR of user.CMDRs) {
      if (rescue.rats.includes(CMDR) || rescue.firstLimpetId === CMDR) {
        return 'self.rescue.update'
      }
    }
  }
  return 'rescue.update'
}

function convertRescueToAPIResult (rescueInstance) {
  let rescue = rescueInstance.toJSON()
  if (rescue.rats) {
    let reducedRats = rescue.rats.map(function (rat) {
      return rat.id
    })
    rescue.rats = reducedRats
  } else {
    rescue.rats = []
  }

  rescue.epic = (rescue.epics.length > 0)
  delete rescue.epics

  delete rescue.firstLimpet
  rescue.firstLimpet = rescue.firstLimpetId
  delete rescue.firstLimpetId
  delete rescue.deletedAt
  return rescue
}

function findRescueWithRats (where) {
  return Rescue.findOne({
    where: where,

  })
}

module.exports = Rescues
