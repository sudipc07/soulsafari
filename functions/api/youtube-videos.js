const CHANNEL_ID = 'UCzN0bIXogtD-XM8O9ShSvMQ';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function json(body, status = 200, cache = 'public, max-age=900') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
      'x-content-type-options': 'nosniff'
    }
  });
}

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function firstMatch(source, pattern) {
  const match = source.match(pattern);
  return match ? decodeXml(match[1].trim()) : '';
}

function parseFeed(xml) {
  return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g))
    .map((entry) => {
      const block = entry[1];
      const id = firstMatch(block, /<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
      const title = firstMatch(block, /<title>([\s\S]*?)<\/title>/);
      const description = firstMatch(block, /<media:description>([\s\S]*?)<\/media:description>/);
      const published = firstMatch(block, /<published>([\s\S]*?)<\/published>/);
      const thumbnail = firstMatch(block, /<media:thumbnail url="([^"]+)"/);

      return {
        id,
        title,
        description,
        published,
        thumbnail: thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`
      };
    })
    .filter((video) => video.id && video.title);
}

export async function onRequestGet() {
  try {
    const response = await fetch(FEED_URL, {
      headers: {
        'user-agent': 'SoulSafari-Learn/1.0'
      },
      cf: {
        cacheTtl: 900,
        cacheEverything: true
      }
    });

    if (!response.ok) {
      return json({ ok: false, videos: [] }, 502, 'no-store');
    }

    const xml = await response.text();
    return json({
      ok: true,
      channel: {
        id: CHANNEL_ID,
        title: 'SoulSafari',
        url: 'https://www.youtube.com/@soulsafari108'
      },
      videos: parseFeed(xml)
    });
  } catch (error) {
    console.error(`YouTube feed request failed: ${error.message}`);
    return json({ ok: false, videos: [] }, 502, 'no-store');
  }
}
