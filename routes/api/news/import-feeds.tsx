import { Handlers } from 'fresh/server.ts';

import { FreshContextState, NewsFeed } from '/lib/types.ts';
import { concurrentPromises } from '/lib/utils/misc.ts';
import { FeedModel } from '/lib/models/news.ts';
import { fetchNewArticles } from '/crons/news.ts';

interface Data {}

export interface RequestBody {
  feedUrls: string[];
}

export interface ResponseBody {
  success: boolean;
  newFeeds: NewsFeed[];
}

export const handler: Handlers<Data, FreshContextState> = {
  async POST(request, context) {
    if (!context.state.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const requestBody = await request.json() as RequestBody;

    if (requestBody.feedUrls) {
      if (requestBody.feedUrls.length === 0) {
        return new Response('Not found', { status: 404 });
      }

      await concurrentPromises(
        requestBody.feedUrls.map((feedUrl) => () => FeedModel.create(context.state.user!.id, feedUrl)),
        5,
      );
    }

    await fetchNewArticles();

    const newFeeds = await FeedModel.list(context.state.user.id);

    const responseBody: ResponseBody = { success: true, newFeeds };

    return new Response(JSON.stringify(responseBody));
  },
};
