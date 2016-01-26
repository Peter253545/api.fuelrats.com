var moment, mongoose, RatSchema, Rescue, Schema, User, winston

moment = require( 'moment' )
mongoose = require( 'mongoose' )
mongoosastic = require( 'mongoosastic' )
winston = require( 'winston' )

Rescue = require( './rescue' )
User = require( './user' )

Schema = mongoose.Schema

RatSchema = new Schema({
  archive: {
    default: false,
    type: Boolean
  },
  CMDRname: {
    type: String
  },
  createdAt: {
    type: 'Moment'
  },
  data: {
    default: {},
    type: Schema.Types.Mixed
  },
  drilled: {
    default: {
      dispatch: false,
      rescue: false
    },
    type: {
      dispatch: {
        type: Boolean
      },
      rescue: {
        type: Boolean
      }
    }
  },
  gamertag: {
    type: String
  },
  lastModified: {
    type: 'Moment'
  },
  joined: {
    default: Date.now(),
    type: 'Moment'
  },
  nicknames: {
    type: [String]
  },
  platform: {
    default: 'pc',
    type: String
  },
  rescues: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: 'Rescue'
    }]
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  versionKey: false
})

RatSchema.pre( 'save', function ( next ) {
  var timestamp

  timestamp = new moment

  if ( this.isNew ) {
    this.createdAt = this.createdAt || timestamp
    this.joined = this.joined || timestamp
  }

  this.lastModified = timestamp

  next()
})

RatSchema.post( 'init', function ( doc ) {
  doc.createdAt = doc.createdAt.valueOf()
  doc.lastModified = doc.lastModified.valueOf()
})

RatSchema.set( 'toJSON', {
  virtuals: true
})

RatSchema.plugin( mongoosastic )

if ( mongoose.models.Rat ) {
  module.exports = mongoose.model( 'Rat' )
} else {
  module.exports = mongoose.model( 'Rat', RatSchema )
}
