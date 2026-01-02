import {
  Card,
  BlockStack,
  Box,
  Text,
} from "@shopify/polaris";

export function ProfitByPOSReport() {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Profit by POS Location</Text>
        <Box padding="800">
          <BlockStack gap="400" inlineAlign="center">
            <Text as="p" variant="headingLg" alignment="center">🤔</Text>
            <Text as="p" variant="bodyLg" alignment="center" fontWeight="semibold">Do I really need this?</Text>
            <Text as="p" tone="subdued" alignment="center">This report breaks down profit by physical point-of-sale location. If you only sell online, you probably don't need it!</Text>
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
}
