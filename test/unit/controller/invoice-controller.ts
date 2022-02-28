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
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import User, { UserType } from '../../../src/entity/user/user';
import InvoiceController from '../../../src/controller/invoice-controller';
import Database from '../../../src/database/database';
import {
  seedAllContainers,
  seedAllPointsOfSale,
  seedAllProducts, seedPointsOfSale, seedProductCategories, seedTransactions,
} from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';
import { BaseInvoiceResponse } from '../../../src/controller/response/invoice-response';
import Invoice from '../../../src/entity/invoices/invoice';
import { CreateInvoiceRequest } from '../../../src/controller/request/invoice-request';
import Transaction from '../../../src/entity/transactions/transaction';
import {
  INVALID_DATE,
  INVALID_USER_ID,
  ZERO_LENGTH_STRING,
} from '../../../src/controller/request/validators/validation-errors';
import InvoiceEntryRequest from '../../../src/controller/request/invoice-entry-request';
import { inUserContext, UserFactory } from '../../helpers/user-factory';
import { TransactionRequest } from '../../../src/controller/request/transaction-request';
import { createTransactionRequest, requestToTransaction } from '../service/invoice-service';
import BalanceService from '../../../src/service/balance-service';

describe('InvoiceController', async () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: InvoiceController,
    adminUser: User,
    localUser: User,
    adminToken: string,
    validInvoiceRequest: CreateInvoiceRequest,
    token: string,
  };

  before(async () => {
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
      type: UserType.MEMBER,
      active: true,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);

    const categories = await seedProductCategories();
    const {
      products,
      productRevisions,
    } = await seedAllProducts([adminUser, localUser], categories);
    const {
      containers,
      containerRevisions,
    } = await seedAllContainers([adminUser, localUser], productRevisions, products);
    await seedAllPointsOfSale([adminUser, localUser], containerRevisions, containers);
    const { pointOfSaleRevisions } = await seedPointsOfSale(
      [adminUser, localUser], containerRevisions,
    );
    await seedTransactions([adminUser, localUser], pointOfSaleRevisions);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });

    const adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'] }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser, roles: ['User'] }, 'nonce');

    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const own = { own: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        Invoices: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
    });

    roleManager.registerRole({
      name: 'User',
      permissions: {
        Invoices: {
          get: own,
        },
      },
      assignmentCheck: async (user: User) => user.type === UserType.LOCAL_USER,
    });

    const controller = new InvoiceController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/invoices', controller.getRouter());

    const validInvoiceRequest: CreateInvoiceRequest = {
      addressee: 'InvoiceRequest',
      byId: adminUser.id,
      description: 'InvoiceRequest test',
      toId: localUser.type,
    };

    ctx = {
      connection,
      app,
      validInvoiceRequest,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('GET /invoices', () => {
    it('should return an HTTP 200 and all existing invoices if admin', async () => {
      const res = await request(ctx.app)
        .get('/invoices')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).to.equal(200);

      const invoices = res.body.records as BaseInvoiceResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const invoiceCount = await Invoice.count();
      expect(invoices.length).to.equal(Math.min(invoiceCount, defaultPagination()));

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(invoiceCount);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/invoices')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.be.empty;
    });
    it('should adhere to pagination', async () => {
      const take = 5;
      const skip = 3;
      const res = await request(ctx.app)
        .get('/invoices')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const invoices = res.body.records as BaseInvoiceResponse[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      const invoiceCount = await Invoice.count();
      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(invoiceCount);
      expect(invoices.length).to.be.at.most(take);
    });
  });
  function testValidationOnRoute(type:any, route: string) {
    async function expectError(req: CreateInvoiceRequest, error: string) {
      // @ts-ignore
      const res = await ((request(ctx.app)[type])(route)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(req));
      expect(res.status).to.eq(400);
      expect(res.body).to.eq(error);
    }

    it('should verify that all transactions are owned by the debtor', async () => {
      const transactionIDs = (await Transaction.find({ relations: ['from'] })).filter((i) => i.from.id !== ctx.adminUser.id).map((t) => t.id);
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, transactionIDs };
      await expectError(req, 'Not all transactions are owned by the debtor.');
    });
    it('should verity that toId is a valid user', async () => {
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, toId: -1 };
      await expectError(req, `toId: ${INVALID_USER_ID().value}`);
    });
    it('should verity that fromDate is a valid date', async () => {
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, fromDate: 'invalid' };
      await expectError(req, `fromDate: ${INVALID_DATE().value}`);
    });
    it('should verity that description is a valid string', async () => {
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, description: '' };
      await expectError(req, `description: ${ZERO_LENGTH_STRING().value}`);
    });
    it('should verity that addressee is a valid string', async () => {
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, addressee: '' };
      await expectError(req, `addressee: ${ZERO_LENGTH_STRING().value}`);
    });
    it('should verity that the custom invoice entries have valid amounts', () => {
      const customEntries: InvoiceEntryRequest[] = [
        {
          description: 'invalid',
          amount: -2,
          price: {
            amount: 72,
            currency: 'EUR',
            precision: 2,
          },
        },
      ];
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, customEntries };
      expectError(req, 'Custom entries: amount: Number must be positive');
    });
    it('should verity that the custom invoice entries have valid descriptions', () => {
      const customEntries: InvoiceEntryRequest[] = [
        {
          description: 'valid',
          amount: 1,
          price: {
            amount: 72,
            currency: 'EUR',
            precision: 2,
          },
        },
        {
          description: '',
          amount: 2,
          price: {
            amount: 72,
            currency: 'EUR',
            precision: 2,
          },
        },
      ];
      const req: CreateInvoiceRequest = { ...ctx.validInvoiceRequest, customEntries };
      expectError(req, 'Custom entries: description: must be a non-zero length string.');
    });
  }

  describe('POST /invoices', () => {
    describe('verifyInvoiceRequest Specification', async () => {
      await testValidationOnRoute('post', '/invoices');
    });
    it('should create an empty Invoice and return an HTTP 200 if admin', async () => {
      const count = await Invoice.count();
      const res = await request(ctx.app)
        .post('/invoices')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validInvoiceRequest);

      expect(await Invoice.count()).to.equal(count + 1);

      expect(res.status).to.equal(200);
    });
    it('should create an Invoice and return an HTTP 200 if admin', async () => {
      await inUserContext(await UserFactory().clone(2), async (debtor: User, creditor: User) => {
        // Spent money.
        const transactions: TransactionRequest[] = await createTransactionRequest(
          debtor.id, creditor.id, 2,
        );

        const { tIds, cost } = await requestToTransaction(transactions);
        const newRequest: CreateInvoiceRequest = {
          ...ctx.validInvoiceRequest,
          transactionIDs: tIds,
          toId: debtor.id,
          byId: creditor.id,
        };
        expect(await BalanceService.getBalance(debtor.id)).is.equal(-1 * cost);

        const count = await Invoice.count();
        const res = await request(ctx.app)
          .post('/invoices')
          .set('Authorization', `Bearer ${ctx.adminToken}`)
          .send(newRequest);

        expect(await BalanceService.getBalance(debtor.id)).is.equal(0);
        expect(await Invoice.count()).to.equal(count + 1);

        expect(res.status).to.equal(200);
      });
    });
  });
});
