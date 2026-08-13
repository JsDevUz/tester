import {getLinking} from '../src/navigation/linking';

describe('getLinking path routing', () => {
  const linking = getLinking(true);

  function route(path: string) {
    return linking.getStateFromPath!(path, {} as any) as any;
  }

  it('routes /d/:slug to the native DeckPractice screen', () => {
    const state = route('/d/AbCd1234');
    expect(state.routes).toEqual([
      {name: 'Main'},
      {name: 'DeckPractice', params: {slug: 'AbCd1234'}},
    ]);
  });

  it('routes /t/:slug to the native TestTaker screen', () => {
    const state = route('/t/XyZw9876');
    expect(state.routes).toEqual([
      {name: 'Main'},
      {name: 'TestTaker', params: {slug: 'XyZw9876', title: 'Test', practiceMode: false}},
    ]);
  });

  it('still falls through unrecognized paths to the Web screen', () => {
    const state = route('/classroom/some-session-id');
    expect(state.routes[1]).toEqual({
      name: 'Web',
      params: {path: '/classroom/some-session-id', title: 'Jamm'},
    });
  });

  it('returns undefined (no navigation) when not logged in', () => {
    const loggedOutLinking = getLinking(false);
    expect(loggedOutLinking.getStateFromPath!('/d/anything', {} as any)).toBeUndefined();
  });
});
