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
import { Dinero } from 'dinero.js';
import BaseResponse from './base-response';
import { BaseUserResponse } from './user-response';
import { ProductCategoryResponse } from './product-category-response';

/**
 * @typedef {BaseResponse} BaseProductResponse
 * @property {string} name.required - The name of the product.
 * @property {Dinero.model} price.required - The price of the product.
 */
export interface BaseProductResponse extends BaseResponse {
  name: string,
  price: Dinero,
}

/**
 * @typedef {BaseProductResponse} ProductResponse
 * @property {number} revision - The revision of the product.
 * @property {User.model} owner.required - The owner of the product.
 * @property {ProductCategory.model} category.required - The category the product belongs to.
 * @property {string} picture.required - The URL to the picture representing this product.
 * @property {number} alcoholPercentage - The percentage of alcohol in this product.
 */
export interface ProductResponse extends BaseProductResponse {
  revision?: number,
  owner: BaseUserResponse,
  category: ProductCategoryResponse,
  picture: String,
  alcoholPercentage: number,
}