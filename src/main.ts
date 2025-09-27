// Visit developers.reddit.com/docs to learn Devvit!

import {Devvit, TriggerContext} from '@devvit/public-api';
import { addDays } from "date-fns";

Devvit.configure({
  redditAPI: true,
  userActions: true,
  media: true,
  redis: true,
})

import {parse} from 'yaml';

const fetchConfig = async (context: TriggerContext, subredditName: string) => {
  const wikiConfig = await context.reddit.getWikiPage(subredditName, "pccmodbot/post_reply");
  const content = wikiConfig.content;
  return await parse(content);
}

Devvit.addTrigger({
  event: 'ModAction',
  async onEvent(event, context) {
    if (event.action === 'unsticky') {
      if (!event.targetComment || !event.targetUser)
        return;

      if (event.targetUser.name === "pccmodbot")
        await context.reddit.remove(event.targetComment.id, false);
      // await context.reddit.

    }
    else if (event.action === 'removelink' && event.moderator && event.targetPost) {
      const mod = event.moderator.name.toLowerCase();
      if (mod !== "automoderator" && mod !== "reddit")
      {
        const post = await context.reddit.getPostById(event.targetPost.id);
        await post.lock();
      }
    }
  },
});

Devvit.addTrigger({
  event: "PostSubmit",
  onEvent: async (event, context) => {

    if(event.author && event.author.name.toLowerCase() ==="automoderator") {
      return;
    }

    if (!context.subredditName || !event.post)
      return;
    const config = await fetchConfig(context, context.subredditName)
    console.log(config);
    if (!config || !config.enabled)
      return;
    const redisKey = `processed-${event.post.id}`;
    const alreadyProcessed = await context.redis.get(redisKey);
    if (alreadyProcessed) {
      return;
    }
    // Make a note that we've processed this conversation
    await context.redis.set(redisKey, new Date().getTime().toString(), { expiration: addDays(new Date(), 7) });
    const resp = await context.redis.get(redisKey);
    console.log(resp);

    try {
      const comment = await context.reddit.submitComment({
        id: event.post.id,
        runAs: "APP",
        text: config.comment,
      });
      await comment.distinguish(true);
      await comment.lock();
    }
    catch (error) {
      console.error(error);
    }
  },
});
export default Devvit;