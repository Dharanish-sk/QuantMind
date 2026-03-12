import {Box,Text} from 'ink';
import {colors,dimensions} from '../theme.js';
import packageJson from '../../package.json';

export function Intro() {
  const { introWidth } = dimensions;
  const welcomeText = 'Welcome to QuantMind';
  const versionText = ` v${packageJson.version}`;
  const fullText = welcomeText + versionText;
  const padding = Math.floor((introWidth - fullText.length - 2) / 2);

  return (
    <Box flexDirection="column" marginTop={2}>
      <Text color={colors.primary}>{'═'.repeat(introWidth)}</Text>
      <Text color={colors.primary}>
        ║{' '.repeat(padding)}
        <Text bold>{welcomeText}</Text>
        <Text color={colors.muted}>{versionText}</Text>
        {' '.repeat(introWidth - fullText.length - padding - 2)}║
      </Text>
      <Text color={colors.primary}>{'═'.repeat(introWidth)}</Text>

      <Box marginTop={1}>
        <Text color={colors.primary} bold>
          {`
 ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗
██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝
██║   ██║██║   ██║███████║██╔██╗ ██║   ██║
██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║
╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║
 ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝
═══════════════════════════════════════════
`}
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text>Your AI-powered financial research agent.</Text>
        <Text color={colors.muted}>
          Model: <Text color={colors.primary}>gemini-2.5-flash</Text> | Inspired by <Text color={colors.accent}>Dexter</Text>
        </Text>
        <Text color={colors.muted}>
          15 tools: financials, prices, ratios, news, insider trades, crypto & more
        </Text>
        <Text color={colors.muted}>
          Press <Text color={colors.white}>Escape</Text> to exit
        </Text>
      </Box>
    </Box>
  );
}
