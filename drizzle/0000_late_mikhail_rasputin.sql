CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`selected_index` integer,
	`is_correct` integer NOT NULL,
	`answered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`exam_session_id`) REFERENCES `exam_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempts_session_idx` ON `attempts` (`exam_session_id`);--> statement-breakpoint
CREATE INDEX `attempts_question_idx` ON `attempts` (`question_id`,`answered_at`);--> statement-breakpoint
CREATE TABLE `exam_items` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`subject_code` text NOT NULL,
	`position` integer NOT NULL,
	`duplicate_group_id` text NOT NULL,
	`choice_order_json` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`selected_index` integer,
	`is_correct` integer,
	`answered_at` text,
	FOREIGN KEY (`exam_session_id`) REFERENCES `exam_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_items_position_idx` ON `exam_items` (`exam_session_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `exam_items_duplicate_idx` ON `exam_items` (`exam_session_id`,`duplicate_group_id`);--> statement-breakpoint
CREATE INDEX `exam_items_session_idx` ON `exam_items` (`exam_session_id`);--> statement-breakpoint
CREATE TABLE `exam_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`seed` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`total_questions` integer NOT NULL,
	`correct_count` integer,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`submitted_at` text
);
--> statement-breakpoint
CREATE TABLE `importance_marks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_document_id` text,
	`source_page` integer,
	`source_question_no` text,
	`question_id` text,
	`mark_type` text NOT NULL,
	`raw_text` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`reviewed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `importance_marks_source_idx` ON `importance_marks` (`source_document_id`,`source_page`,`source_question_no`);--> statement-breakpoint
CREATE INDEX `importance_marks_question_review_idx` ON `importance_marks` (`question_id`,`reviewed`);--> statement-breakpoint
CREATE TABLE `question_study_items` (
	`question_id` text NOT NULL,
	`study_item_id` text NOT NULL,
	`role` text DEFAULT 'solution' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`study_item_id`) REFERENCES `study_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_study_items_unique_idx` ON `question_study_items` (`question_id`,`study_item_id`);--> statement-breakpoint
CREATE INDEX `question_study_items_study_idx` ON `question_study_items` (`study_item_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_code` text NOT NULL,
	`source_document_id` text,
	`source_page` integer,
	`source_question_no` text,
	`stem` text NOT NULL,
	`choices_json` text NOT NULL,
	`answer_index` integer,
	`explanation` text DEFAULT '' NOT NULL,
	`duplicate_group_id` text NOT NULL,
	`ocr_confidence` real DEFAULT 0 NOT NULL,
	`review_status` text DEFAULT 'needs_review' NOT NULL,
	`importance_score` integer DEFAULT 0 NOT NULL,
	`importance_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`subject_code`) REFERENCES `subjects`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_source_no_idx` ON `questions` (`source_document_id`,`source_question_no`);--> statement-breakpoint
CREATE INDEX `questions_subject_ready_idx` ON `questions` (`subject_code`,`review_status`,`importance_score`);--> statement-breakpoint
CREATE INDEX `questions_duplicate_group_idx` ON `questions` (`duplicate_group_id`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_code` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`page_count` integer,
	`content_hash` text,
	FOREIGN KEY (`subject_code`) REFERENCES `subjects`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_documents_subject_title_idx` ON `source_documents` (`subject_code`,`normalized_title`);--> statement-breakpoint
CREATE TABLE `study_items` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_code` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`content` text NOT NULL,
	`canonical_key` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`conditions` text,
	`units` text,
	`caution` text,
	`frequency` integer DEFAULT 0 NOT NULL,
	`importance_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`subject_code`) REFERENCES `subjects`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_items_kind_key_idx` ON `study_items` (`kind`,`canonical_key`);--> statement-breakpoint
CREATE INDEX `study_items_frequency_idx` ON `study_items` (`frequency`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_display_order_idx` ON `subjects` (`display_order`);