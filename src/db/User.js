/* eslint max-lines-per-function:0 */

import bcrypt from 'bcrypt'
import UserView from '../view/UserView'
import { JSONObject, IRCNicknames } from '../classes/Validators'

const passwordMinLength = 12
const passwordMaxLength = 1024
const nicknameMaxLength = 35

export default function User (db, DataTypes) {
  const user = db.define('User', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
      validate: {
        isUUID: 4
      }
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      validate: {
        JSONObject
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING(passwordMaxLength),
      allowNull: false,
      validate: {
        len: [passwordMinLength, passwordMaxLength]
      }
    },
    nicknames: {
      type: DataTypes.ARRAY(DataTypes.STRING(nicknameMaxLength)),
      allowNull: true,
      defaultValue: [],
      set (value) {
        const lowerValue = value.map((nickname) => {
          return nickname.toLowerCase()
        })
        this.setDataValue('nicknames', lowerValue)
      },
      validate: {
        IRCNicknames
      }
    },
    frontierId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    image: {
      type: DataTypes.BLOB(),
      allowNull: true,
      defaultValue: undefined
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'legacy', 'deactivated'),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        notEmpty: true,
        isIn: [['active', 'inactive', 'legacy', 'deactivated']]
      }
    },
    suspended: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: undefined
    },
    avatar: {
      type: DataTypes.VIRTUAL,
      get () {
        if (Reflect.has(this.dataValues, 'avatar') === true) {
          return this.dataValues.avatar
        }
        return false
      },
      include: []
    },
    permissions: {
      type: DataTypes.VIRTUAL(DataTypes.ARRAY(DataTypes.STRING)),
      get () {
        if (!this.groups) {
          return []
        }
        return this.groups.reduce((accumulator, value) => {
          return accumulator.concat(value.permissions)
        }, [])
      },
      include: []
    }
  }, {
    paranoid: true
  })

  const hashPasswordHook = async function (instance) {
    if (!instance.changed('password')) {
      return
    }
    const hash = await bcrypt.hash(instance.get('password'), global.BCRYPT_ROUNDS_COUNT)
    instance.set('password', hash)
  }

  user.beforeCreate(hashPasswordHook)
  user.beforeUpdate(hashPasswordHook)

  user.prototype.toJSON = function () {
    const values = this.get()
    delete values.password
    return values
  }

  user.prototype.renderView = function () {
    return UserView
  }

  user.prototype.isSuspended = function () {
    if (!this.suspended) {
      return false
    }

    return this.suspended - new Date() > 0
  }

  user.prototype.isDeactivated = function () {
    return this.status === 'deactivated'
  }

  user.prototype.isConfirmed = function () {
    return this.groups.length > 0
  }



  user.prototype.preferredRat = function () {
    if (this.displayRat) {
      return this.displayRat
    }
    return this.rats[0]
  }

  user.prototype.vhost = function () {
    if (!this.groups || this.groups.length === 0) {
      return undefined
    }

    const [group] = this.groups.sort((group1, group2) => {
      return group1.priority - group2.priority
    })

    if (group.isAdministrator) {
      return group.vhost
    }
    const rat = this.preferredRat()
    const identifier = rat ? rat.name : user.id

    return `${getIRCSafeName(identifier)}.${group.vhost}`
  }

  user.associate = function (models) {
    models.User.hasMany(models.Rat, {
      as: 'rats',
      foreignKey: 'userId'
    })

    models.User.belongsTo(models.Rat, { as: 'displayRat', constraints: false })

    models.User.hasOne(models.Decal, {
      foreignKey: 'userId',
      as: 'decal'
    })

    models.User.belongsToMany(models.Group, {
      as: 'groups',
      foreignKey: 'userId',
      through: {
        model: models.UserGroups,
        foreignKey: 'userId'
      }
    })

    models.User.hasMany(models.Client, { foreignKey: 'userId', as: 'clients' })
    models.User.hasMany(models.Epic, { foreignKey: 'approvedById', as: 'approvedEpics' })
    models.User.hasMany(models.Epic, { foreignKey: 'nominatedById', as: 'nominatedEpics' })

    models.User.addScope('defaultScope', {
      attributes: {
        include: [
          [db.literal('"image" IS NOT NULL'), 'avatar']
        ],
        exclude: [
          'image',
          'permissions',
          'avatar'
        ]
      },
      include: [
        {
          model: models.Rat,
          as: 'rats',
          include: [{
            model: models.Ship,
            as: 'ships',
            required: false,
            include: []
          }]
        },
        {
          model: models.Rat,
          as: 'displayRat',

          include: [{
            model: models.Ship,
            as: 'ships',
            required: false,
            include: []
          }]
        }, {
          model: models.Group,
          as: 'groups',
          required: false,
          through: {
            attributes: ['userId']
          },
          include: [],
          order: [
            ['priority', 'DESC']
          ]
        }, {
          model: models.Client,
          as: 'clients',
          required: false,
          include: []
        }
      ]
    }, { override: true })

    models.User.addScope('image', {
      attributes: [
        'image'
      ]
    })
  }
  return user
}


function getIRCSafeName (rat) {
  let ratName = rat.name
  ratName = ratName.replace(/ /gu, '')
  ratName = ratName.replace(/[^a-zA-Z0-9\s]/gu, '')
  return ratName.toLowerCase()
}
