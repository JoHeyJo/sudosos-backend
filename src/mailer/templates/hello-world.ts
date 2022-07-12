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
import AbstractMailTemplate from './abstract-mail-template';
import { signatureDutch, signatureEnglish } from './signature';

export interface HelloWorldOptions {
  name: string;
}

export default class HelloWorld extends AbstractMailTemplate<HelloWorldOptions> {
  protected getHTMLDutch(): string {
    return `<p>Hallo wereld, ${this.contentOptions.name}!</p>`;
  }

  protected getHTMLEnglish(): string {
    return `<p>Hello world, ${this.contentOptions.name}!</p>`;
  }

  protected getTextDutch(): string {
    return `Hallo wereld, ${this.contentOptions.name}!`;
  }

  protected getTextEnglish(): string {
    return `Hello world, ${this.contentOptions.name}!`;
  }

  protected getSubjectDutch(): string {
    return 'Hallo wereld!';
  }

  protected getSubjectEnglish(): string {
    return 'Hello world!';
  }
}
