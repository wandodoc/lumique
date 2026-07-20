import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const cleanPath = (req.query.path || '').split('?')[0].replace(/^\/|\/$/g, '');
  const showId = req.query.id || (cleanPath.startsWith('concerts/') ? cleanPath.split('/')[1] : null);
  
  const indexPath = path.join(process.cwd(), 'dist', 'index.html');
  let html = '';

  try {
    html = fs.readFileSync(indexPath, 'utf-8');
  } catch (err) {
    // Development mode fallback
    try {
      html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
    } catch (e) {
      return res.status(404).send('Not found');
    }
  }

  // Default page metadata
  const PAGE_META = {
    '': {
      title: 'Lumique 대시보드',
      desc: '루미크 동아리 운영 및 회계 관리 시스템 대시보드입니다.'
    },
    'members': {
      title: 'Lumique 회원 관리',
      desc: '동아리 회원 목록 및 부원별 연습/공연 참여 현황을 확인합니다.'
    },
    'concerts': {
      title: 'Lumique 공연 관리',
      desc: '루미크 동아리의 역대 공연 목록 및 예매/신청 현황을 관리합니다.'
    },
    'dues': {
      title: 'Lumique 회비 납부 현황',
      desc: '동아리원들의 월별 회비 납부 내역 및 미납 현황을 확인합니다.'
    },
    'ledger': {
      title: 'Lumique 입출금 내역',
      desc: '투명하게 운영되는 동아리 재정 입출금 세부 내역 및 장부입니다.'
    },
    'analytics': {
      title: 'Lumique 재정 요약',
      desc: '회비 수입, 공연 수익, 지출 내역의 월별 요약 및 재정 통계를 확인합니다.'
    },
    'calendar': {
      title: 'Lumique 연습 일정',
      desc: '정기 연습곡 마스터 현황 및 동아리 일정(연습/공연/뒤풀이)을 조율합니다.'
    },
    'settings': {
      title: 'Lumique 설정',
      desc: '시스템 비밀번호 변경 및 데이터 백업/복구를 관리합니다.'
    },
    'reservations': {
      title: 'Lumique 티켓 예매 관리',
      desc: '공연별 티켓 신청 인원 및 입금 현황, 현장 관람객 입장을 관리합니다.'
    }
  };

  let title = 'Lumique';
  let desc = '루미크 동아리의 통합 운영 관리 시스템입니다.';
  let img = '';

  let matchedMeta = null;
  if (cleanPath === 'reservations' || cleanPath.startsWith('manage/')) {
    matchedMeta = PAGE_META['reservations'];
  } else if (cleanPath.startsWith('calendar/')) {
    matchedMeta = PAGE_META['calendar'];
  } else {
    matchedMeta = PAGE_META[cleanPath];
  }

  if (matchedMeta) {
    title = matchedMeta.title;
    desc = matchedMeta.desc;
  }

  try {
    if (showId) {
      const url = 'https://firestore.googleapis.com/v1/projects/lumique-3a380/databases/(default)/documents/club_ledger/main_state';
      const fbRes = await fetch(url);
      
      if (fbRes.ok) {
        const fbJson = await fbRes.json();
        const showsArray = fbJson.fields?.shows?.arrayValue?.values || [];
        
        let targetShow = null;
        for (const item of showsArray) {
          const fields = item.mapValue?.fields;
          if (fields && fields.id?.stringValue === showId) {
            targetShow = fields;
            break;
          }
        }

        if (targetShow) {
          title = targetShow.title?.stringValue || '공연 신청';
          const date = targetShow.date?.stringValue || '';
          const time = targetShow.time?.stringValue || '';
          const loc = targetShow.location?.stringValue || '';
          
          const formatDate = (d, t) => {
            if (!d) return '';
            const dateObj = new Date(d);
            if (isNaN(dateObj.getTime())) return `${d} ${t}`.trim();
            const w = ['일', '월', '화', '수', '목', '금', '토'];
            const [y, m, day] = d.split('-');
            const dayOfWeek = w[dateObj.getDay()];
            return `${y}.${Number(m)}.${Number(day)} (${dayOfWeek}) ${t}`.trim();
          };
          
          desc = `${formatDate(date, time)} | ${loc}`.trim();
          img = targetShow.imageUrl?.stringValue || '';
        }
      }
    }
  } catch (err) {
    console.error('OG API Error:', err);
  }

  // Update HTML with metadata
  html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  
  const replaceMeta = (property, value, isName = false) => {
    const attr = isName ? 'name' : 'property';
    const regex = new RegExp(`<meta\\s+[^>]*?${attr}=["']${property}["'][^>]*?>`, 'i');
    if (regex.test(html)) {
      html = html.replace(regex, `<meta ${attr}="${property}" content="${value}" />`);
    } else {
      html = html.replace('</head>', `<meta ${attr}="${property}" content="${value}" />\n</head>`);
    }
  };

  const host = req.headers.host || 'lumique-beta.vercel.app';
  const defaultLogo = `https://${host}/logo.png`;
  
  let logo = defaultLogo;
  if (img) {
    if (img.startsWith('data:image/')) {
      logo = `https://${host}/api/image?id=${showId}`;
    } else if (img.startsWith('http://') || img.startsWith('https://')) {
      logo = img;
    }
  }

  replaceMeta('description', desc, true);
  replaceMeta('og:title', title);
  replaceMeta('og:description', desc);
  replaceMeta('og:image', logo);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
