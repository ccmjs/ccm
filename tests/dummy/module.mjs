import { html } from 'https://unpkg.com/lit-html?module'

export const name = 'John';
export const data = { foo: 'bar' };
export function sayHello( name ) { console.log( `Hello, ${name}!` ); }

export const main = name => html`
  Hello, ${name}!
  Welcome.
`;