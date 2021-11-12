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
import {
  Column, Entity, ManyToOne,
} from 'typeorm';
// eslint-disable-next-line import/no-cycle
import Invoice from './invoice';
import User from '../user/user';
import BaseEntityWithoutId from '../base-entity-without-id';

export enum InvoiceState {
  CREATED = 1,
  SENT = 2,
  PAYED = 3,
  DELETED = 4,
}

/**
 * @typedef {BaseEntityWithoutId} InvoiceStatus
 * @property {Invoice.model} invoice.required - The invoice to which this state belongs.
 * @property {User.model} changedBy.required - The user that changed the invoice status.
 * @property {enum} state.required - The state of the Invoice
 * @property {string} dateChanged.required - The date that the InvoiceStatus was changed.
 */
@Entity()
export default class InvoiceStatus extends BaseEntityWithoutId {
  @ManyToOne(() => Invoice, { primary: true, nullable: false })
  public invoice: Invoice;

  @ManyToOne(() => User, { nullable: false })
  public changedBy: User;

  @Column()
  public state: InvoiceState;

  @Column()
  public dateChanged: Date;
}
