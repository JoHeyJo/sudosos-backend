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
import log4js, { Logger } from 'log4js';
import { Response } from 'express';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import { BaseInvoiceResponse } from './response/invoice-response';
import InvoiceService from '../service/invoice-service';

export default class InvoiceController extends BaseController {
  private logger: Logger = log4js.getLogger('InvoiceController');

  /**
    * Creates a new product controller instance.
    * @param options - The options passed to the base controller.
    */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
    * @inhertidoc
    */
  getPolicy(): Policy {
    return {
      '/': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Invoices', ['*']),
          handler: this.getAllInvoices.bind(this),
        },
      },
    };
  }

  /**
   * Returns all invoices in the system.
   * @route GET /invoices
   * @group invoices - Operations of the invoices controller
   * @security JWT
   * @returns {Array.<BaseInvoiceResponse>} 200 - All existing invoices
   * @returns {string} 500 - Internal server error
   */
  public async getAllInvoices(req: RequestWithToken, res: Response): Promise<void> {
    const { body } = req;
    this.logger.trace('Get all invoices', body, 'by user', req.token.user);

    // Handle request
    try {
      const invoices: BaseInvoiceResponse[] = await InvoiceService.getInvoices();
      res.json(invoices);
    } catch (error) {
      this.logger.error('Could not return all invoices:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
