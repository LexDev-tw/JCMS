const newsService = require('../src/services/newsService');



(async () => {

    const d = await newsService.getNewsAll();

    console.log('\n== all ==', d.updatedAt, 'sources:', d.sources.join(', '));

    if (d.sourceStatus) {

        d.sourceStatus.forEach((s) => {

            console.log('  src', s.source, s.ok ? 'OK' : `FAIL ${s.error}`);

        });

    }

    d.items.slice(0, 8).forEach((item) => {

        console.log(`  [${item.source}] ${item.title.slice(0, 50)} ${item.time}${item.breaking ? ' *' : ''}`);

    });

})().catch(console.error);

