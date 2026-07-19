/**
 * @format
 */

import {API_URL, WEB_URL} from '../src/config/env';

test('mobile endpoints are configured', () => {
  expect(API_URL).toContain('/api/v1');
  expect(WEB_URL).toMatch(/^https?:\/\//);
});
