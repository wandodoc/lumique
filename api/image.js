export default async function handler(req, res) {
  const showId = req.query.id;
  if (!showId) {
    return res.status(400).send('Missing show ID');
  }

  try {
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
        const imgDataUrl = targetShow.imageUrl?.stringValue || '';
        
        if (imgDataUrl && imgDataUrl.startsWith('data:image/')) {
          const match = imgDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1];
            const base64Data = match[2];
            const buffer = Buffer.from(base64Data, 'base64');
            
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.status(200).send(buffer);
          }
        }
      }
    }
  } catch (err) {
    console.error('Image API Error:', err);
  }

  // Fallback to logo.png
  const host = req.headers.host || 'lumique-beta.vercel.app';
  res.redirect(`https://${host}/logo.png`);
}
