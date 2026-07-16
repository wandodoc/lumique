import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const showId = req.query.id;
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
          const title = targetShow.title?.stringValue || '공연 신청';
          const date = targetShow.date?.stringValue || '';
          const time = targetShow.time?.stringValue || '';
          const loc = targetShow.location?.stringValue || '';
          const desc = `${date} ${time} | ${loc}`;
          const img = targetShow.imageUrl?.stringValue || '';

          html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
          
          let ogTags = `
            <meta property="og:title" content="${title}" />
            <meta property="og:description" content="${desc}" />
          `;
          
          if (img) {
            ogTags += `\n            <meta property="og:image" content="${img}" />`;
          }
          
          html = html.replace('</head>', ogTags + '\n</head>');
        }
      }
    }
  } catch (err) {
    console.error('OG API Error:', err);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
