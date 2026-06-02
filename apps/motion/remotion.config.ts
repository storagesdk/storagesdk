import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// H.264 high quality for landing-page + social uploads.
Config.setCodec('h264');
Config.setCrf(18);
