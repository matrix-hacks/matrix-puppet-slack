// https://github.com/canozokur/slacktomd
import { slacktomd } from './slacktomd';
const parser = new slacktomd();

export const slackdown = function(msg, users, channels) {
  return parser.parse(msg, users, channels);
}
