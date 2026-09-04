interface RecommendationSetupLeafRow {
  original: {
    setupId: string
  }
}

export const countDistinctRecommendationSetups = (leafRows: RecommendationSetupLeafRow[] | undefined) =>
  new Set(leafRows?.map(row => row.original.setupId)).size
