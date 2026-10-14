/** Client-safe review labels and DTO types. Server runners live in `./server`. */
export {
  REVIEW_CATEGORIES,
  STATIC_REVIEW_CHECK_IDS,
  categoryLabel,
  isReviewCategory,
  reviewRunWaves,
  type ReviewCategory,
  type ReviewCheckId,
  type ReviewCheckKind,
  type ReviewCheckUiStatus,
  type ReviewCheckDto,
  type ReviewFindingDto,
} from "./ui";
export {
  REVIEW_SEVERITY_CHIP_CLASS,
  REVIEW_SEVERITY_LABEL,
  REVIEW_SEVERITY_ORDER,
  coerceReviewSeverity,
  compareSeverityDesc,
  countFindingSeverities,
  sortCategoriesBySeverity,
  totalSeverityCount,
  worstSeverity,
  type ReviewSeverity,
  type ReviewSeverityCounts,
} from "./severity";
