// Visit developers.reddit.com/docs to learn Devvit!

import { Devvit } from '@devvit/public-api';
import type { TriggerContext } from '@devvit/public-api';
import { addDays } from 'date-fns';
import { App } from './src/client';             // make sure ./client (or ./client/index.tsx) exists/exports App

Devvit.configure({
  redditAPI: true,
  userActions: true,
  media: true,
  redis: true,
});

Devvit.addCustomPostType({
  name: 'rgmodbot',
  render: App,
});

const fetchConfig = async (context: TriggerContext, subredditName: string) => {
  const wikiConfig = await context.reddit.getWikiPage(subredditName, 'rgmodbot/post_reply');
  const content = wikiConfig.content;
  return parse(content);
};

Devvit.addTrigger({
  event: 'ModAction',
  async onEvent(event, context) {
    if (event.action === 'unsticky') {
      if (!event.targetComment || !event.targetUser) return;

      if (event.targetUser.name === 'rgmodbot') {
        await context.reddit.remove(event.targetComment.id, false);
      }
    } else if (event.action === 'removeLink' && event.moderator && event.targetPost) { // ✅ camelCase
      const mod = event.moderator.name.toLowerCase();
      if (mod !== 'automoderator' && mod !== 'reddit') {
        const post = await context.reddit.getPostById(event.targetPost.id);
        await post.lock();
      }
    }
  },
});

Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: async (event, context) => {
    if (event.author && event.author.name.toLowerCase() === 'automoderator') return;
    if (!context.subredditName || !event.post) return;

    const config = await fetchConfig(context, context.subredditName);
    if (!config || !config.enabled) return;

    const redisKey = `processed-${event.post.id}`;
    const alreadyProcessed = await context.redis.get(redisKey);
    if (alreadyProcessed) return;

    // Store a marker with a 7-day expiration.
    // If types complain, switch to seconds: { expiration: 7 * 24 * 60 * 60 }
    await context.redis.set(redisKey, Date.now().toString(), { expiration: addDays(new Date(), 7) });

    try {
      // ✅ runAs goes in the 2nd argument, not inside the request object
      const comment = await context.reddit.submitComment(
        { id: event.post.id, text: config.comment },
        { runAs: 'APP' }
      );
      await comment.distinguish(true);
      await comment.lock();
    } catch (error) {
      console.error(error);
    }
  },
});

export default Devvit;
