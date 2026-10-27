// 키 모듈: 코드에 키가 없으면 처음 한 번만 입력받아 이 기기에만 저장한다.
window.YT = window.YT || {};
YT.ensureKey = function () {
  if (YT.KEY) return YT.KEY;
  try { YT.KEY = localStorage.getItem('yt_key') || ''; } catch (_) {}
  if (!YT.KEY) {
    const k = (window.prompt('유튜브 API 키를 붙여 넣으세요. 이 기기에만 저장돼요.') || '').trim();
    if (k) { YT.KEY = k; try { localStorage.setItem('yt_key', k); } catch (_) {} }
  }
  if (!YT.KEY) throw new Error('API 키가 필요해요. 새로고침 후 키를 입력해 주세요.');
  return YT.KEY;
};
