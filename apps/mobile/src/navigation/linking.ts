import type {LinkingOptions} from '@react-navigation/native';
import type {RootStackParamList} from './types';

// https://jamm.uz/<anything> opens the app (via App Links, see
// android/app/src/main/AndroidManifest.xml + apps/frontend/public/.well-known/assetlinks.json).
// Only a couple of top-level paths have a dedicated native screen; everything
// else (tests, classroom, history detail, ...) is handled by WebScreen, which
// already renders the same web app inside a WebView with the session token
// injected - so unknown paths fall through to that instead of a native 404.
export function getLinking(loggedIn: boolean): LinkingOptions<RootStackParamList> {
  return {
    prefixes: ['https://jamm.uz', 'jamm://'],
    config: {
      screens: {
        Login: 'login',
        Main: '',
      },
    },
    getStateFromPath: (path, _options) => {
      if (!loggedIn) return undefined;

      const normalized = path.startsWith('/') ? path : `/${path}`;
      if (normalized === '/' || normalized === '') {
        return {
          routes: [{name: 'Main'}],
        } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
      }

      // School invites have a native screen; everything else falls through to
      // the WebView below.
      const invite = normalized.match(/^\/school-invite\/([^/?#]+)/);
      if (invite) {
        return {
          routes: [{name: 'Main'}, {name: 'SchoolInvite', params: {token: invite[1]}}],
        } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
      }

      const deckMatch = normalized.match(/^\/d\/([^/?#]+)/);
      if (deckMatch) {
        return {
          routes: [{name: 'Main'}, {name: 'DeckPractice', params: {slug: deckMatch[1]}}],
        } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
      }

      const testMatch = normalized.match(/^\/t\/([^/?#]+)/);
      if (testMatch) {
        return {
          routes: [
            {name: 'Main'},
            {name: 'TestTaker', params: {slug: testMatch[1], title: 'Test', practiceMode: false}},
          ],
        } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
      }

      return {
        routes: [
          {name: 'Main'},
          {name: 'Web', params: {path: normalized, title: 'Jamm'}},
        ],
      } as ReturnType<NonNullable<LinkingOptions<RootStackParamList>['getStateFromPath']>>;
    },
  };
}
