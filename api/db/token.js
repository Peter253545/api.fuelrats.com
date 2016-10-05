'use strict'

module.exports = function (sequelize, DataTypes) {
  let Token = sequelize.define('Token', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    scope: {
      type: DataTypes.ARRAY(DataTypes.STRING(128)),
      allowNull: false,
      defaultValue: []
    },
    value: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    classMethods: {
      associate: function (models) {
        Token.belongsTo(models.User, { as: 'user' })
        Token.belongsTo(models.Client, { as: 'client' })
      }
    }
  })

  return Token
}
