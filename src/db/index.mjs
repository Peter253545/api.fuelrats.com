import Sequelize from 'sequelize'
import PaperTrail from 'sequelize-paper-trail'
import config from '../config'
import logger from '../logging'

import Avatar from './Avatar'
import Client from './Client'
import Code from './Code'
import Decal from './Decal'
import Epic from './Epic'
import EpicUsers from './EpicUsers'
import Group from './Group'
import Rat from './Rat'
import Rescue from './Rescue'
import RescueRats from './RescueRats'
import Reset from './Reset'
import Session from './Session'
import Ship from './Ship'
import Token from './Token'
import User from './User'
import UserGroups from './UserGroups'
import VerificationToken from './VerificationToken'

const models = {
  Avatar,
  User,
  Rat,
  Rescue,
  RescueRats,
  Client,
  Code,
  Token,
  Reset,
  Epic,
  EpicUsers,
  Ship,
  Decal,
  Group,
  UserGroups,
  VerificationToken,
  Session
}

const { database, username, password, hostname, port } = config.postgres

const { Op } = Sequelize
const operatorsAliases = {
  eq: Op.eq,
  ne: Op.ne,
  gte: Op.gte,
  gt: Op.gt,
  lte: Op.lte,
  lt: Op.lt,
  not: Op.not,
  in: Op.in,
  noIn: Op.notIn,
  is: Op.is,
  like: Op.like,
  notLike: Op.notLike,
  ilike: Op.iLike,
  iLike: Op.iLike,
  notILike: Op.notILike,
  regexp: Op.regexp,
  notRegexp: Op.notRegexp,
  iRegexp: Op.iRegexp,
  notIRegexp: Op.notIRegexp,
  between: Op.between,
  notBetween: Op.notBetween,
  overlap: Op.overlap,
  contains: Op.contains,
  contained: Op.contained,
  adjacent: Op.adjacent,
  strictLeft: Op.strictLeft,
  strictRight: Op.strictRight,
  noExtendRight: Op.noExtendRight,
  noExtendLeft: Op.noExtendLeft,
  and: Op.and,
  or: Op.or,
  any: Op.any,
  all: Op.all,
  values: Op.values,
  col: Op.col
}

const db = new Sequelize(database, username, password, {
  host: hostname,
  port,
  dialect: 'postgres',
  logging: (message) => {
    logger.info(message)
  },

  pool: {
    idle: 1000,
    min: 0,
    acquire: 30000
  },
  operatorsAliases
})

/* eslint-disable */
db.addHook('beforeCount', function (options) {
  if (this._scope.include && this._scope.include.length > 0) {
    options.distinct = true
    options.col = this._scope.col || options.col || `"${this.options.name.singular}".id`
  }

  if (options.include && options.include.length > 0) {
    options.include = undefined
  }
})
/* eslint-enable */

Object.values(models).forEach((model) => {
  model.init(db, Sequelize)
})

Object.values(models).forEach((model) => {
  if (Reflect.has(model, 'associate')) {
    Reflect.apply(model.associate, model, [models])
  }
})


const paperTrail = PaperTrail.init(db, {
  debug: process.env.NODE_ENV !== 'production',
  userModel: 'User',
  exclude: [
    'createdAt',
    'updatedAt'
  ],
  enableMigration: true,
  enableRevisionChangeModel: true,
  UUID: true,
  continuationKey: 'userId'
})
paperTrail.defineModels({})

models.Rescue.Revisions = models.Rescue.hasPaperTrail()

export {
  db,
  db as sequelize,
  Sequelize,
  Op,
  Avatar,
  Client,
  Code,
  Decal,
  Epic,
  EpicUsers,
  Group,
  Rat,
  Rescue,
  RescueRats,
  Reset,
  Session,
  Ship,
  Token,
  User,
  UserGroups,
  VerificationToken
}