import { User, Decal, Avatar } from '../db'
import { UserView, DecalView, RatView, ClientView, GroupView } from '../view'
import bcrypt from 'bcrypt'
import Anope from '../classes/Anope'
import workerpool from 'workerpool'
import StatusCode from '../classes/StatusCode'
import Decals from './Decals'
import Permission from '../classes/Permission'
import { Context } from '../classes/Context'

import {
  NotFoundAPIError,
  UnauthorizedAPIError,
  UnsupportedMediaAPIError,
  BadRequestAPIError,
  InternalServerError
} from '../classes/APIError'

import {
  WritePermission,
  permissions,
  authenticated,
  GET,
  POST,
  PUT,
  DELETE,
  parameters,
  required,
  PATCH,
  getJSONAPIData
} from './API'
import APIResource from './APIResource'
import { websocket } from '../classes/WebSocket'
import DatabaseQuery from '../query/DatabaseQuery'
import DatabaseDocument from '../Documents/DatabaseDocument'
import { DocumentViewType } from '../Documents/Document'

/**
 * Class for the /users endpoint
 */
export default class Users extends APIResource {
  static imageResizePool = workerpool.pool('./dist/workers/image.js')
  static sslGenerationPool = workerpool.pool('./dist/workers/certificate.js')

  /**
   * @inheritdoc
   */
  get type () {
    return 'users'
  }

  /**
   * Get a list of users according to a search query
   * @param {Context} ctx a request context
   * @returns {Promise<DatabaseDocument>} JSONAPI result document
   */
  @GET('/users')
  @websocket('users', 'search')
  @authenticated
  async search (ctx) {
    const query = new DatabaseQuery({ connection: ctx })
    const results = await User.findAndCountAll(query.searchObject)
    const result = await Anope.mapNicknames(results)

    return new DatabaseDocument({ query, result, type: UserView })
  }

  /**
   * Get a specific user by ID
   * @param {Context} ctx a request context
   * @returns {Promise<DatabaseDocument>} JSONAPI result document
   */
  @GET('/users/:id')
  @websocket('users', 'read')
  @authenticated
  @parameters('id')
  async findById (ctx) {
    const { query, result } = await super.findById({ ctx, databaseType: User })

    const user = await Anope.mapNickname(result)
    return new DatabaseDocument({ query, result: user, type: UserView })
  }

  /**
   * Get a user's profile
   * @endpoint
   */
  @GET('/profile')
  @websocket('profiles', 'read')
  @authenticated
  async profile (ctx) {
    const query = new DatabaseQuery({ connection: ctx })
    const result = await User.findOne({
      where: {
        id: ctx.state.user.id
      }
    })

    const redeemable = await Decals.getEligibleDecalCount({ user: ctx.state.user })

    const user = await Anope.mapNickname(result)
    return new DatabaseDocument({ query, result: user, type: UserView, meta: { redeemable } })
  }

  /**
   * Get a user's avatar
   * @param {Context} ctx a request context
   * @param {Function} next Koa routing function
   * @returns {Promise<undefined>} resolves a promise upon completion
   */
  @GET('/users/:id/image')
  @websocket('users', 'image', 'read')
  async image (ctx, next) {
    const avatar = await Avatar.scope('data').findOne({
      where: {
        userId: ctx.params.id
      }
    })
    if (!avatar) {
      throw new NotFoundAPIError({ parameter: 'id' })
    }

    ctx.type = 'image/jpeg'
    ctx.body = avatar.image
    next()
  }

  /**
   * Generate and set a certificate for use with IRC identification
   * @param {Context} ctx request context
   * @returns {Promise<undefined>} resolves a promise upon completion
   */
  @GET('/users/:id/certificate')
  @authenticated
  async certificate (ctx) {
    const ratName = ctx.state.user.preferredRat().name
    const { certificate, fingerprint }  = await Users.sslGenerationPool.exec('generateSslCertificate',
      [ratName])

    const anopeAccount = await Anope.getAccount(ctx.state.user.email)
    if (!anopeAccount) {
      throw new BadRequestAPIError()
    }

    await Anope.setFingerprint(ctx.state.user.email, fingerprint)
    ctx.set('Content-disposition', `attachment; filename=${ratName}.pem`)
    ctx.set('Content-type', 'application/x-pem-file')
    ctx.body = certificate
  }

  /**
   * Change a user's password
   * @param {Context} ctx request context
   * @returns {Promise<DatabaseDocument>} an updated user if the password change is successful
   */
  @PUT('/users/:id/password')
  @websocket('users', 'password', 'update')
  @authenticated
  @required('password', 'new')
  async setPassword (ctx) {
    const { password, newPassword } = getJSONAPIData({ ctx, type: 'password-changes' })

    const user = await User.findOne({
      where: {
        id: ctx.params.id
      }
    })

    this.requireWritePermission({ connection: ctx, entity: user })

    const validatePassword = await bcrypt.compare(password, user.password)
    if (!validatePassword) {
      throw new UnauthorizedAPIError({ pointer: '/data/attributes/password' })
    }

    user.password = newPassword
    await user.save()
    await Anope.setPassword(user.email, user.password)

    const result = await Anope.mapNickname(user)

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: UserView })
  }

  /**
   * Endpoint for admins to create new users. For self-creating a user, see /register
   * @param {Context} ctx a request context
   * @returns {Promise<DatabaseDocument>} a created user if the request is successful
   */
  @POST('/users')
  @websocket('users', 'create')
  @authenticated
  @permissions('users.write')
  async create (ctx) {
    const user = await super.create({ ctx, databaseType: User })

    const query = new DatabaseQuery({ connection: ctx })
    const result = await Anope.mapNickname(user)

    ctx.response.status = StatusCode.created
    return new DatabaseDocument({ query, result, type: UserView })
  }

  /**
   * Update a user
   * @param {Context} ctx a request context
   * @returns {Promise<DatabaseDocument>} an updated user if the request is successful
   */
  @PUT('/users/:id')
  @websocket('users', 'update')
  @authenticated
  async update (ctx) {
    const user = await super.update({ ctx, databaseType: User, updateSearch: { id: ctx.params.id } })

    const query = new DatabaseQuery({ connection: ctx })
    const result = await Anope.mapNickname(user)
    return new DatabaseDocument({ query, result, type: UserView })
  }

  /**
   * Delete a user
   * @param {Context} ctx a request context
   * @returns {Promise<boolean>} returns a 204 if the request is successful
   */
  @DELETE('/users/:id')
  @websocket('users', 'delete')
  @authenticated
  async delete (ctx) {
    await super.delete({ ctx, databaseType: User, callback: (user) => {
      return Anope.deleteAccount(user.email)
    } })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Update a user's avatar image
   * @param {Context} ctx request context
   * @returns {Promise<DatabaseDocument>} an updated user if the request is successful
   */
  @POST('/users/:id/image')
  @websocket('users', 'image')
  @authenticated
  async setimage (ctx) {
    const user = await User.findOne({
      where: {
        id: ctx.params.id
      }
    })

    if (!user) {
      throw new NotFoundAPIError({ parameter: 'id' })
    }

    this.requireWritePermission({ connection: ctx, entity: user })

    const imageData = ctx.req._readableState.buffer.head.data

    const formattedImageData = await Users.convertImageData(imageData)

    await Avatar.destroy({
      where: {
        userId: ctx.params.id
      }
    })

    await Avatar.create({
      image: formattedImageData,
      userId: ctx.params.id
    })

    const query = new DatabaseQuery({ connection: ctx })
    const result = await User.findOne({
      where: {
        id: ctx.params.id
      }
    })
    return new DatabaseDocument({ query, result, type: UserView })
  }

  /**
   * Redeem a decal
   * @param {Context} ctx request context
   * @returns {Promise<DatabaseDocument>} a decal
   */
  @POST('/users/:id/decals')
  @authenticated
  async redeemDecal (ctx) {
    const user = await User.findOne({
      where: {
        id: ctx.params.id
      }
    })

    this.requireWritePermission({ connection: ctx, entity: user })

    const redeemable = await Decals.getEligibleDecalCount({ user })
    if (redeemable < 1) {
      throw new BadRequestAPIError({})
    }

    const availableDecal = await Decal.findOne({
      where: {
        userId: { is: undefined },
        claimedAt: { is: undefined },
        type: 'Rescues'
      }
    })

    if (!availableDecal) {
      throw new InternalServerError({})
    }

    const result = await availableDecal.update({
      userId: user.id,
      claimedAt: Date.now()
    })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: DecalView })
  }

  // Relationships

  /**
   * Get a user's rat relationships
   * @param {Context} ctx request context
   * @returns {Promise<DatabaseDocument>} a list of a user's rat relationships
   */
  @GET('/users/:id/relationships/rats')
  @websocket('users', 'rats', 'read')
  @authenticated
  async relationshipRatsView (ctx) {
    const result = await this.relationshipView({
      ctx,
      databaseType: User,
      relationship: 'rats'
    })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: RatView, view: DocumentViewType.relationship })
  }

  /**
   * Create new rat relationship(s) on a user
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @POST('/users/:id/relationships/rats')
  @websocket('users', 'rats', 'create')
  @authenticated
  async relationshipRatsCreate (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'add',
      relationship: 'rats'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Override a user's rat relationships with a new set
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @PATCH('/users/:id/relationships/rats')
  @websocket('users', 'rats', 'patch')
  @authenticated
  async relationshipRatsPatch (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'patch',
      relationship: 'rats'
    })

    // I'm sorry Clapton, JSONAPI made me do it
    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Delete one or more rat relationships of a user
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @DELETE('/users/:id/relationships/rats')
  @websocket('users', 'rats', 'delete')
  @authenticated
  async relationshipRatsDelete (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'remove',
      relationship: 'rats'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Get a user's display rat relationship
   * @param {Context} ctx request context
   * @returns {Promise<DatabaseDocument>} a user's display rat relationship
   */
  @GET('/users/:id/relationships/displayRat')
  @websocket('users', 'displayRat', 'read')
  @authenticated
  async relationshipDisplayRatView (ctx) {
    const result = await this.relationshipView({
      ctx,
      databaseType: User,
      relationship: 'displayRat'
    })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: RatView, view: DocumentViewType.relationship })
  }

  /**
   * Set a user's display rat relationship
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @PATCH('/users/:id/relationships/displayRat')
  @websocket('users', 'displayRat', 'patch')
  @authenticated
  async relationshipDisplayRatPatch (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'patch',
      relationship: 'displayRat'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Get a user's group relationships
   * @param {Context} ctx request context
   * @returns {Promise<DatabaseDocument>} a list of a user's group relationships
   */
  @GET('/users/:id/relationships/groups')
  @websocket('users', 'groups', 'read')
  @authenticated
  async relationshipGroupsView (ctx) {
    const result = await this.relationshipView({
      ctx,
      databaseType: User,
      relationship: 'groups'
    })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: GroupView, view: DocumentViewType.relationship })
  }

  /**
   * Create new group relationship(s) on a user
   * @param {Context} ctx request context
   * @returns {Promise<DatabaseDocument|boolean>} 204 no content
   */
  @POST('/users/:id/relationships/groups')
  @websocket('users', 'groups', 'create')
  @authenticated
  async relationshipGroupsCreate (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'add',
      relationship: 'groups'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Override a user's group relationships with a new set
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @PATCH('/users/:id/relationships/groups')
  @websocket('users', 'groups', 'patch')
  @authenticated
  async relationshipGroupsPatch (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'patch',
      relationship: 'groups'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Delete one or more group relationships of a user
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @DELETE('/users/:id/relationships/groups')
  @websocket('users', 'groups', 'delete')
  @authenticated
  async relationshipGroupsDelete (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'remove',
      relationship: 'groups'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Get a user's client relationships
   * @param {Context} ctx request context
   * @returns {Promise<DatabaseDocument>} a list of a user's client relationships
   */
  @GET('/users/:id/relationships/clients')
  @websocket('users', 'clients', 'read')
  @authenticated
  async relationshipClientsView (ctx) {
    const result = await this.relationshipView({
      ctx,
      databaseType: User,
      relationship: 'clients'
    })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: ClientView, view: DocumentViewType.relationship })
  }

  /**
   * Create new client relationship(s) on a user
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @POST('/users/:id/relationships/clients')
  @websocket('users', 'clients', 'create')
  @authenticated
  async relationshipClientsCreate (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'add',
      relationship: 'clients'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Override a user's client relationships with a new set
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @PATCH('/users/:id/relationships/clients')
  @websocket('users', 'clients', 'patch')
  @authenticated
  async relationshipClientsPatch (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'patch',
      relationship: 'clients'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Delete one or more client relationships of a user
   * @param {Context} ctx request context
   * @returns {Promise<boolean>} 204 no content
   */
  @DELETE('/users/:id/relationships/clients')
  @websocket('users', 'clients', 'delete')
  @authenticated
  async relationshipClientsDelete (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: User,
      change: 'remove',
      relationship: 'clients'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }


  /**
   * @inheritdoc
   */
  get writePermissionsForFieldAccess () {
    return {
      data: WritePermission.group,
      email: WritePermission.sudo,
      password: WritePermission.sudo,
      status: WritePermission.sudo,
      suspended: WritePermission.sudo,
      stripeId: WritePermission.group,
      frontierId: WritePermission.internal,
      createdAt: WritePermission.internal,
      updatedAt: WritePermission.internal,
      deletedAt: WritePermission.internal
    }
  }

  /**
   * @inheritdoc
   */
  isSelf ({ ctx, entity }) {
    return entity.id === ctx.state.user.id
  }

  /**
   *
   * @inheritdoc
   */
  changeRelationship ({ relationship }) {
    switch (relationship) {
      case 'rats':
        return {
          many: true,

          hasPermission (connection) {
            return Permission.granted({ permissions: ['rats.write'], connection })
          },

          add ({ entity, ids }) {
            return entity.addRats(ids)
          },

          patch ({ entity, ids }) {
            return entity.setRats(ids)
          },

          remove ({ entity, ids }) {
            return entity.removeRats(ids)
          }
        }

      case 'displayRat':
        return {
          many: false,

          hasPermission (connection, entity, id) {
            const hasRat = connection.state.user.rats.some((rat) => {
              return rat.id === id
            })
            return hasRat || Permission.granted({ permissions: ['rats.write'], connection })
          },

          patch ({ entity, id }) {
            return entity.setDisplayRat(id)
          }
        }

      case 'groups':
        return {
          many: true,

          hasPermission (connection) {
            return Permission.granted({ permissions: ['groups.write'], connection })
          },

          add ({ entity, ids }) {
            return entity.addGroups(ids)
          },

          patch ({ entity, ids }) {
            return entity.setGroups(ids)
          },

          remove ({ entity, ids }) {
            return entity.removeGroups(ids)
          }
        }

      case 'clients':
        return {
          many: true,

          hasPermission (connection) {
            return Permission.granted({ permissions: ['clients.write'], connection })
          },

          add ({ entity, ids }) {
            return entity.addClients(ids)
          },

          patch ({ entity, ids }) {
            return entity.setClients(ids)
          },

          remove ({ entity, ids }) {
            return entity.removeClients(ids)
          }
        }

      default:
        throw new UnsupportedMediaAPIError({ pointer: '/relationships' })
    }
  }

  /**
   * @inheritdoc
   */
  get relationTypes () {
    return {
      'rats': 'rats',
      'displayRat': 'rats',
      'groups': 'groups',
      'clients': 'clients'
    }
  }

  /**
   * Contact the image processing web worker to process an image into the correct format and size
   * @param {Buffer} originalImageData the original image data
   * @returns {Promise<Buffer>} processed image data
   */
  static async convertImageData (originalImageData) {
    try {
      return Buffer.from(await Users.imageResizePool.exec('avatarImageResize', [originalImageData]))
    } catch (error) {
      if (error.message.includes('unsupported image format')) {
        throw new UnsupportedMediaAPIError({})
      } else {
        throw error
      }
    }
  }
}
