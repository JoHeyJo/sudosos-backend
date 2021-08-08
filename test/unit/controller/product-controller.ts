/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { Connection, FindManyOptions } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { request, expect } from 'chai';
import User, { UserType } from '../../../src/entity/user/user';
import ProductController from '../../../src/controller/product-controller';
import ProductRequest from '../../../src/controller/request/product-request';
import Database from '../../../src/database/database';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { seedAllProducts, seedProductCategories } from '../../seed';
import Product from '../../../src/entity/product/product';
import { ProductResponse } from '../../../src/controller/response/product-response';
import UpdatedProduct from '../../../src/entity/product/updated-product';

/**
 * Tests if a product response is equal to the request.
 * @param source - The source from which the product was created.
 * @param response - The received product.
 * @return true if the source and response describe the same product.
 */
function productEq(source: ProductRequest, response: ProductResponse) {
  return source.name === response.name
      && source.category === response.category.id
      && source.alcoholPercentage === response.alcoholPercentage
      && source.price === response.price.amount
      && source.picture === response.picture;
}

describe('ProductController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: ProductController,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
    validProductReq: ProductRequest,
    invalidProductReq: ProductRequest,
  };

  // Initialize context
  before(async () => {
    // initialize test database
    const connection = await Database.initialize();

    // create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);

    const categories = await seedProductCategories();
    await seedAllProducts([adminUser, localUser], categories);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'] }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: [] }, 'nonce');

    const validProductReq: ProductRequest = {
      name: 'Valid product',
      picture: 'picture link',
      price: 1,
      alcoholPercentage: 0,
      category: 2,
    };

    const invalidProductReq: ProductRequest = {
      ...validProductReq,
      name: '',
    };

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Product: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    const controller = new ProductController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/products', controller.getRouter());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
      validProductReq,
      invalidProductReq,
    };
  });

  // close database connection
  after(async () => {
    await ctx.connection.close();
  });

  // Unit test cases
  describe('GET /products', () => {
    it('should return an HTTP 200 and all existing products in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      // Every product that has a current revision should be returned.
      const activeProductCount = await Product.count({ where: 'currentRevision' } as FindManyOptions);
      expect((res.body as ProductResponse[]).length).to.equal(activeProductCount);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/products')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });
  describe('POST /products', () => {
    it('should store the given product in the database and return an HTTP 200 and the product if admin', async () => {
      const productCount = await Product.count();
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validProductReq);

      expect(await Product.count()).to.equal(productCount + 1);
      expect(productEq(ctx.validProductReq, res.body as ProductResponse)).to.be.true;
      const databaseProduct = await UpdatedProduct.findOne((res.body as ProductResponse).id);
      expect(databaseProduct).to.exist;

      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if the given product is invalid', async () => {
      const productCount = await Product.count();
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidProductReq);

      expect(await Product.count()).to.equal(productCount);
      expect(res.body).to.equal('Invalid product.');

      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const productCount = await Product.count();
      const res = await request(ctx.app)
        .post('/products')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validProductReq);

      expect(await Product.count()).to.equal(productCount);
      expect(res.body).to.be.empty;

      expect(res.status).to.equal(403);
    });
  });
  describe('GET /products/:id', () => {
    it('should return an HTTP 200 and the product with given id if admin', async () => {
      const res = await request(ctx.app)
        .get('/products/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect((res.body as ProductResponse).id).to.equal(1);

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the product with the given id does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/products/${(await Product.count()) + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(await Product.findOne((await Product.count()) + 1)).to.be.undefined;

      // check if banner is not returned
      expect(res.body).to.equal('Product not found.');

      // success code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/products/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.body).to.be.empty;

      expect(res.status).to.equal(403);
    });
  });
  describe('PATCH /products/:id', () => {
    it('should return an HTTP 200 and the product update if admin', async () => {
      const res = await request(ctx.app)
        .patch('/products/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validProductReq);

      expect(productEq(ctx.validProductReq, res.body as ProductResponse)).to.be.true;
      const databaseProduct = await UpdatedProduct.findOne((res.body as ProductResponse).id);
      expect(databaseProduct).to.exist;

      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if the update is invalid', async () => {
      const res = await request(ctx.app)
        .patch('/products/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidProductReq);

      expect(res.body).to.equal('Invalid product.');
      expect(res.status).to.equal(400);
    });
    it('should return an HTTP 404 if the product with the given id does not exist', async () => {
      const res = await request(ctx.app)
        .patch(`/products/${(await Product.count()) + 1}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validProductReq);

      // sanity check
      expect(await Product.findOne((await Product.count()) + 1)).to.be.undefined;

      // check if banner is not returned
      expect(res.body).to.equal('Product not found.');

      // success code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .patch('/products/1')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validProductReq);

      // check if banner is not returned
      expect(res.body).to.be.empty;

      // success code
      expect(res.status).to.equal(403);
    });
  });
  describe('GET /products/updated', () => {
    it('should return an HTTP 200 and all existing updated products in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/products/updated')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      // Every product that has a current revision should be returned.
      const activeProductCount = await UpdatedProduct.count();
      expect((res.body as ProductResponse[])).to.not.be.empty;
      expect((res.body as ProductResponse[]).length).to.equal(activeProductCount);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/products/updated')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body).to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });
  describe('GET /products/:id/update', () => {
    it('should return the product update when it exists', async () => {
      const res = await request(ctx.app)
        .get('/products/4/update')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // sanity check / precondition
      expect(await UpdatedProduct.findOne(4)).to.exist;
      expect((res.body as ProductResponse)).to.exist;
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the product with the given id does not exist', async () => {
      const res = await request(ctx.app)
        .get(`/products/${(await Product.count()) + 2}/update`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // sanity check
      expect(await Product.findOne((await Product.count()) + 2)).to.be.undefined;

      // check if banner is not returned
      expect(res.body).to.equal('Product not found.');

      // success code
      expect(res.status).to.equal(404);
    });
    it('should return an empty response if the product with the given id has no update', async () => {
      const res = await request(ctx.app)
        .get('/products/2/update')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // sanity check / precondition
      expect(await UpdatedProduct.findOne(2)).to.be.undefined;
      expect(res.body).to.be.empty;
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/products/4/update')
        .set('Authorization', `Bearer ${ctx.token}`);

      // sanity check / precondition
      expect(await UpdatedProduct.findOne(4)).to.exist;
      expect(res.body).to.be.empty;
      expect(res.status).to.equal(403);
    });
  });
  describe('POST /products/:id/approve', () => {
    it('should approve the product update if it exists and admin', async () => {
      // sanity check / precondition
      expect(await UpdatedProduct.findOne(4)).to.exist;

      const res = await request(ctx.app)
        .post('/products/4/approve')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // sanity check / precondition
      expect(await UpdatedProduct.findOne(4)).to.be.undefined;

      const latest = await request(ctx.app)
        .get('/products/4')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(latest.body).to.deep.equal(res.body);
      expect(res.status).to.equal(200);
    });
    it('should return a HTTP 404 and an empty response if the product had no pending update', async () => {
      // sanity check / precondition
      expect(await UpdatedProduct.findOne(2)).to.be.undefined;
      expect(await Product.findOne(2)).to.exist;

      const res = await request(ctx.app)
        .post('/products/2/approve')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.body).to.equal('Product update not found.');
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // sanity check / precondition
      expect(await UpdatedProduct.findOne(5)).to.exist;

      const res = await request(ctx.app)
        .post('/products/4/approve')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.body).to.be.empty;
      expect(res.status).to.equal(403);
    });
  });
});