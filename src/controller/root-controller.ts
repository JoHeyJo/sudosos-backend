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
import { Request, Response } from 'express';
import log4js, { Logger } from 'log4js';
import { getConnection } from 'typeorm';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';

export default class RootController extends BaseController {
  /**
   * Reference to the logger instance.
   */
  private logger: Logger = log4js.getLogger('RootController');

  /**
   * Creates a new root controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/ping': {
        GET: {
          policy: async () => Promise.resolve(true),
          handler: this.ping.bind(this),
        },
      },
    };
  }

  /**
   * Ping the backend to check whether everything is working correctly
   * @route GET /ping
   * @group root - Operations of the root controller
   * @returns {string} 200 - Success
   * @returns {string} 500 - Internal server error (database error)
   */
  public async ping(req: Request, res: Response): Promise<void> {
    this.logger.trace('Ping by', req.ip);

    try {
      await getConnection().query('SELECT NULL LIMIT 0');
      res.status(200).json('Pong!');
    } catch (e) {
      res.status(500).json('Internal server error.');
    }
  }
}