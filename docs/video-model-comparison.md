# Video → explanation: model cost & quality comparison

_Generated 2026-07-07T14:51:07.281Z by `pnpm video-model-compare`._

## Source video

- **URL:** https://www.youtube.com/watch?v=8AheL0t-h-U
- **Title:** Trump Posts AI 'Dr. Trump' Video — Prescribes Diet Coke To Those Suffering With 'TDS'
- **Quality:** 360p @ 30fps
- **Resolution:** 640×360
- **Video codec:** avc1.42001E
- **File size:** 3.3 MB
- **Duration:** 90s (from yt-dlp)
- **Audio:** ignored (task is video-only)
- **Metadata source:** yt-dlp

## Run configuration

- **Gemini media resolutions swept:** low, default, high
- **Gemma frame sampling:** 1 fps (one frame every 1s, capped at 600 frames)
- **Video prompt:** You are analyzing silent video footage (ignore any audio). Watch the entire video and produce a clear, structured explanation of what happens: describe the scene, key objects and people, actions over time, and any notable changes. Be thorough but concise.

## Cost & performance comparison

| Model | Mode | Status | Time | Video/Image tokens | Audio tokens | Input tokens | Output tokens | Cost (this clip) | Cost / hour of silent footage |
|---|---|---|--:|--:|--:|--:|--:|--:|--:|
| Gemini 3.1 Flash Lite | video · low | ✅ ok | 6.34s | 5,940 | 2,250 | 8,239 | 350 | $0.002585 | $0.059937 |
| Gemini 3.1 Flash Lite | video · default | ✅ ok | 9.02s | 5,940 | 2,250 | 8,239 | 378 | $0.001069 | $0.059979 |
| Gemini 3.1 Flash Lite | video · high | ✅ ok | 12.30s | 23,760 | 2,250 | 26,059 | 387 | $0.007095 | $0.238193 |
| Gemini 3.1 Pro (preview) | video · low | ✅ ok | 20.88s | 5,940 | 2,250 | 8,239 | 2,428 | $0.045614 | $0.504434 |
| Gemini 3.1 Pro (preview) | video · default | ✅ ok | 19.43s | 5,940 | 2,250 | 8,239 | 2,200 | $0.042878 | $0.501698 |
| Gemini 3.1 Pro (preview) | video · high | ✅ ok | 17.73s | 23,760 | 2,250 | 26,059 | 1,556 | $0.070790 | $1.919570 |
| Gemini 3.5 Flash | video · low | ✅ ok | 5.24s | 5,940 | 2,250 | 8,239 | 496 | $0.016823 | $0.360938 |
| Gemini 3.5 Flash | video · default | ✅ ok | 5.70s | 5,940 | 2,250 | 8,239 | 653 | $0.008679 | $0.362351 |
| Gemini 3.5 Flash | video · high | ✅ ok | 6.27s | 23,760 | 2,250 | 26,059 | 905 | $0.047233 | $1.433819 |
| Gemma 4 31B | frames@1fps | ✅ ok | 107.86s | 24,015* | 0 | 24,907 | 919 | $0.003855 | $0.134976 |

> _Cost / hour of silent footage_ extrapolates the measured **video/image** token rate (scalable tokens ÷ clip seconds × 3600) at the model's input price, plus this run's prompt and output cost held constant. It excludes audio tokens — the target is footage with no audio. For the Gemma frame fallback, frames are split across multiple gateway requests (segment descriptions + a synthesis pass); cost and time aggregate across all calls, and the per-hour figure assumes the same fps scaled up (`fps × 3600` frames/hour). `*` marks an estimated token count (provider did not report an image modality). A real hour of footage would be split across many requests, so treat these as per-hour unit-cost estimates, not single-call quotes.

## Takeaways

- **Cheapest for a full hour of silent footage:** Gemini 3.1 Flash Lite (video · low) at ~$0.059937/hr.
- **Most expensive:** Gemini 3.1 Pro (preview) (video · high) at ~$1.919570/hr (32.0× the cheapest).
- **Resolution lever (Gemini 3.1 Flash Lite):** `high` media resolution costs ~$0.238193/hr vs ~$0.059979/hr at default — about **4.0× more** (23,760 vs 5,940 video tokens) for finer visual detail. Note: `low` produces the **same** token count as default (5,940) — Gemini 3.x already samples video at the low rate, so `low` is a no-op and only `high` moves cost.
- **Gemma via frames works but needs chunking:** at 1 fps the 90 frames exceed one AI-Gateway request, so they were split across **5 calls** (segment descriptions + a synthesis pass). Cost ~$0.134976/hr. It still never sees motion *between* frames, so fast actions and timing can be missed; higher fps raises cost and fidelity.

## Model outputs

### Gemini 3.1 Flash Lite — video · low (`gemini-3.1-flash-lite`, vertex)

_6.34s · 5,940 video tokens · 350 output tokens · $0.002585 this clip · $0.059937/hr_

This video presents a series of short clips featuring former President Donald Trump, dressed in a white lab coat and stethoscope with a nametag reading "Donald J. Trump, M.D.", alongside several celebrities and public figures. The context suggests a satirical video regarding "TDS" (Trump Derangement Syndrome), formatted as a medical testimonials commercial.

**Key Figures:**
*   **Donald Trump:** Appears in the opening and closing segments to introduce the medical "condition" and offer a supposed "treatment plan."
*   **Celebrity Testimonials:** Several individuals, appearing to be look-alikes or AI-generated versions of public figures, provide testimonials:
    *   Rosie O'Donnell
    *   Whoopi Goldberg
    *   Edward Norton
    *   Robert De Niro
    *   Julia Roberts

**Action Sequence:**
1.  **Introduction:** Donald Trump stands in a hallway and discusses the symptoms of "TDS," claiming to have a solution.
2.  **Testimonials:** The video cuts to individuals sitting in a medical examination room, each speaking about their struggles with the condition, and how they found relief after "listening to Dr. Trump."
3.  **Treatment:** The video returns to Trump, who outlines his "treatment plan": turning off fake news, saying prayers, and drinking a Diet Coke.
4.  **Closing:** Trump delivers a final message to the viewer, promising a "remarkable difference" in their life.

**Visual Context:**
The video maintains a consistent visual style, using a medical office setting (with a stretcher and medical equipment visible in the background) to frame the testimonials as if they were part of a professional medical endorsement.

### Gemini 3.1 Flash Lite — video · default (`gemini-3.1-flash-lite`, vertex)

_9.02s · 5,940 video tokens · 378 output tokens · $0.001069 this clip · $0.059979/hr_

This video appears to be a satire piece featuring a montage of deepfake clips. Here is an analysis of the visual elements:

**Setting**
The footage is filmed to look like a medical office setting. The background includes a hallway, a doorway with a “Exam Room” sign, and a medical examination room featuring a patient table, a blood pressure cuff, and a light switch on the wall. 

**People**
The video features a series of people speaking to the camera:
* **Donald Trump:** He is wearing a white doctor's coat over a suit and tie, with a stethoscope draped around his neck. His name tag reads, “Donald J. Trump, MD.”
* **Various Celebrities:** The video cuts between several well-known celebrities, including Rosie O’Donnell, Whoopi Goldberg, and Robert De Niro, all seated in the same medical examination chair against the same background.

**Actions and Sequence**
* **Introduction:** Donald Trump addresses the camera, acting as a physician, and introduces a “treatment plan” for a condition he refers to as “TDS.”
* **Testimonials:** Several celebrities are shown sitting in the exam room, describing personal struggles with anger, sleeplessness, and anxiety. Each celebrity appears to speak about a shift in their emotional state. 
* **Conclusion:** Donald Trump returns to the screen to offer a “cure,” which involves turning off “fake news,” praying, and drinking a diet soda. 

**Key Changes**
The video utilizes editing to create the appearance of a unified clinical setting. While the individuals are filmed in different locations, the background remains static throughout the segments to maintain the illusion of a single, consistent environment. 

*Note: This video is a piece of political satire utilizing AI-generated video technology to depict public figures in a fictionalized scenario.*

### Gemini 3.1 Flash Lite — video · high (`gemini-3.1-flash-lite`, vertex)

_12.30s · 23,760 video tokens · 387 output tokens · $0.007095 this clip · $0.238193/hr_

This video appears to be a satire piece featuring a series of short clips edited together.

**Scene and Characters:**
*   **Donald Trump:** Featured prominently throughout the video, dressed in a white lab coat with a stethoscope around his neck and a name tag reading "Donald J. Trump, M.D." He appears to be filmed in a hospital or medical office setting.
*   **"Patients":** Various celebrities appear in individual clips, all seemingly filmed in the same examination room. These include Rosie O'Donnell, John Leguizamo, Whoopi Goldberg, Edward Norton, Robert De Niro, and Julia Roberts.

**Actions and Progression:**
1.  **Introduction:** Donald Trump addresses the camera, acting as a physician. He claims to have a "treatment plan" for individuals suffering from "TDS" (Trump Derangement Syndrome).
2.  **Testimonials:** The video cuts to a montage of the listed celebrities, each speaking to the camera. They mimic a patient testimonial format, describing personal struggles—such as anxiety, loss of sleep, and social difficulty—which they attribute to "TDS." They conclude each segment by expressing that the treatment plan helped them see a "difference."
3.  **Conclusion:** The video returns to Trump in his "doctor" attire. He provides his "treatment plan": "Turn off fake news, say your prayers, and if you’re ever feel anxious, just have a Diet Coke."

**Notable Elements:**
*   **Format:** The video uses lower-third graphics identifying it as a "Daily Wire News" report from July 2, 2026.
*   **Visual Style:** The consistent background behind the celebrities and the uniform appearance of the "doctor" suggest a highly stylized, satirical, or deepfake-style production intended to mock public figures known for their vocal opposition to Donald Trump.

### Gemini 3.1 Pro (preview) — video · low (`gemini-3.1-pro-preview`, vertex)

_20.88s · 5,940 video tokens · 2,428 output tokens · $0.045614 this clip · $0.504434/hr_

Based on the visual information in the silent video, here is a structured explanation of the events:

### **Overall Premise and Visual Context**
The video is presented as a news clip, indicated by a "DAILY WIRE NEWS" logo in the bottom right corner. A persistent lower-third graphic reads: "TRUMP POST AI 'DR. TRUMP' VIDEO WITH CELEBRITY TESTIMONIALS ABOUT THEIR 'TDS'". Additional on-screen text includes a date, "JULY 2, 2026," and a credit to "@REALDONALDTRUMP VIA TRUTH SOCIAL." A red and white progress bar runs along the left edge. The video alternates between Donald Trump acting as a doctor and a series of individuals resembling famous celebrities acting as patients giving testimonials. 

### **Settings and Key People**
*   **The "Doctor":** Donald Trump is dressed as a physician, wearing a white lab coat over a white shirt and blue striped tie, with a stethoscope draped around his neck. He is positioned in what appears to be a brightly lit hospital or clinic corridor.
*   **The "Patients":** Six different individuals who bear strong resemblances to well-known celebrities appear sequentially. They are all filmed in the exact same setting: a doctor's examination room featuring a medical exam table and wall-mounted diagnostic equipment. All are dressed casually and speak directly to the camera.

### **Chronological Sequence of Events**
The video consists entirely of people speaking directly to the camera, with the scene cutting back and forth between "Dr. Trump" and the "patients."

*   **00:00 - 00:09:** The video begins with Donald Trump in the hallway setting, speaking to the camera.
*   **00:10 - 00:19:** The scene cuts to the first patient, an individual resembling **Rosie O'Donnell**, speaking from the exam room.
*   **00:20 - 00:30:** The view cuts to a second patient, resembling **John Leguizamo**, in the same exam room setting.
*   **00:31 - 00:39:** The view cuts to a third patient, resembling **Whoopi Goldberg**, also in the exam room.
*   **00:40 - 00:50:** The video returns to Donald Trump in the hallway, where he continues speaking.
*   **00:51 - 01:00:** The scene cuts back to the exam room for a fourth patient, resembling **Edward Norton**.
*   **01:01 - 01:09:** The view cuts to a fifth patient, resembling **Robert De Niro**, in the exam room.
*   **01:10 - 01:20:** The view cuts to the sixth and final patient, resembling **Julia Roberts**, in the exam room.
*   **01:21 - 01:29:** The video concludes with a final segment of Donald Trump speaking from the hallway setting. 

### **Notable Actions and Changes**
*   There is no physical action or interaction between the subjects; the entire video is a montage of speaking heads delivering monologues to the camera.
*   The framing of the "patients" is highly uniform, maintaining a consistent chest-up shot against an identical background for each person.
*   The most significant detail is provided by the lower-third graphic, which frames the entire visual sequence as an AI-generated creation rather than genuine footage of these individuals.

### Gemini 3.1 Pro (preview) — video · default (`gemini-3.1-pro-preview`, vertex)

_19.43s · 5,940 video tokens · 2,200 output tokens · $0.042878 this clip · $0.501698/hr_

Based on the silent visual footage, here is a structured explanation of the video:

### Scene and Visual Context
The video is stylized to look like a news broadcast segment or a medical public service announcement. It features constant on-screen text overlays:
*   **Top left:** "CREDIT: @REALDONALDTRUMP VIA TRUTH SOCIAL"
*   **Bottom left:** The date "JULY 2, 2026" in a red box.
*   **Bottom center:** A lower-third graphic reading "TRUMP POST AI 'DR. TRUMP' VIDEO WITH CELEBRITY TESTIMONIALS ABOUT THEIR 'TDS'". This text reveals that the video is AI-generated and satirical.
*   **Bottom right:** The logo for "DAILY WIRE NEWS."

The footage alternates between two primary medical settings: a brightly lit, blurred hospital hallway and a standard clinical examination room equipped with a patient bed and wall-mounted medical instruments.

### Key People and Objects
*   **The "Doctor":** An AI-generated likeness of Donald Trump. He is wearing a white doctor's coat with "Donald J. Trump, MD" embroidered on the chest, a white shirt, a blue tie, and a stethoscope draped around his neck. He appears confident and addresses the camera directly.
*   **The "Patients":** A series of AI-generated individuals resembling well-known celebrities, including Rosie O'Donnell, John Cusack, Whoopi Goldberg, Edward Norton, Robert De Niro, and Julia Roberts. They are all seated in the same medical examination room. Visually, they are presented with somber, concerned, or distressed facial expressions and body language, typical of patients discussing an ailment.

### Actions over Time
The video follows a clear structure, cutting back and forth between the "doctor" and his "patients":

1.  **Introduction (0:00 - 0:09):** The video begins with the "Dr. Trump" character standing in the hallway, speaking directly to the camera as if introducing a medical condition or treatment.
2.  **First Testimonial Montage (0:10 - 0:39):** The scene cuts to the examination room. We see successive, brief clips of the AI likenesses of Rosie O'Donnell, John Cusack, and Whoopi Goldberg. Each appears to be giving a serious, emotionally heavy testimonial about a personal struggle, looking directly into the camera.
3.  **Doctor's Interjection (0:40 - 0:50):** The footage returns to "Dr. Trump" in the hallway, who continues speaking to the camera.
4.  **Second Testimonial Montage (0:50 - 1:20):** The video cuts back to the exam room for more testimonials. The AI likenesses of Edward Norton, Robert De Niro, and Julia Roberts are shown in sequence. They exhibit similar visual signs of distress and seriousness as the first group while speaking.
5.  **Conclusion (1:21 - End):** The final segment returns to "Dr. Trump" in the hallway. He finishes his statement to the camera, appearing to offer a solution or final thought before the video ends. 

### Notable Details
The entire video is a visual parody. The juxtaposition of a political figure presented as a medical doctor and celebrities appearing as struggling patients, combined with the explicit on-screen text identifying it as an AI creation about "TDS" (Trump Derangement Syndrome), clearly frames the video as a piece of political satire designed to look like a medical advertisement.

### Gemini 3.1 Pro (preview) — video · high (`gemini-3.1-pro-preview`, vertex)

_17.73s · 23,760 video tokens · 1,556 output tokens · $0.070790 this clip · $1.919570/hr_

Based on the visual evidence, here is a structured explanation of the video:

**Overview and Format**
The video is stylized as a medical testimonial or infomercial. However, on-screen text banners (lower thirds) present throughout the video identify it as an AI-generated video posted by Donald Trump. The banners read "DAILY WIRE NEWS," show a date of "JULY 2, 2026," and feature the headline: "TRUMP POST AI 'DR. TRUMP' VIDEO WITH CELEBRITY TESTIMONIALS ABOUT THEIR 'TDS'."

**Key Figures and Settings**
The video alternates between two distinct settings and sets of people:

1.  **The "Doctor" (Donald Trump):**
    *   **Appearance:** Donald Trump is depicted wearing a white doctor's lab coat over a suit and a blue-and-white striped tie, with a stethoscope draped around his neck. The coat is embroidered with "Donald J. Trump, MD."
    *   **Setting:** He is standing in a brightly lit hallway that resembles a hospital or clinical environment.
    *   **Action:** He speaks directly to the camera with a serious, authoritative expression, acting as the medical professional introducing and concluding a treatment plan.

2.  **The "Patients" (Celebrity Testimonials):**
    *   **Figures:** A series of recognizable actors and public figures appear, including Rosie O'Donnell, John Leguizamo, Whoopi Goldberg, Edward Norton, Robert De Niro, and Julia Roberts.
    *   **Setting:** All these individuals are shown sitting in what appears to be a standard medical examination room, featuring an examination table, wall-mounted medical equipment, and health informational posters.
    *   **Action:** Each celebrity is shown speaking directly to the camera with solemn, serious, or distressed expressions. Their body language mimics that of patients recounting personal struggles or discussing a medical condition in a testimonial format.

**Sequence of Events**
*   **Introduction:** The video begins with "Dr. Trump" in the hallway, setting the premise.
*   **First Set of Testimonials:** The scene cuts to the medical exam room, showing consecutive, individual clips of Rosie O'Donnell, John Leguizamo, and Whoopi Goldberg speaking.
*   **Intermission:** The video briefly cuts back to "Dr. Trump" continuing his address in the hallway.
*   **Second Set of Testimonials:** The video returns to the exam room for more individual clips, featuring Edward Norton, Robert De Niro, and Julia Roberts.
*   **Conclusion:** The video ends with a final shot of "Dr. Trump" in the hallway, delivering his concluding remarks.

**Summary**
Visually, the video is a satirical, AI-generated compilation that uses the visual language of a medical infomercial. It casts Donald Trump as a doctor and various celebrities as his patients, intercutting his direct addresses with their confessional-style testimonials.

### Gemini 3.5 Flash — video · low (`gemini-3.5-flash`, vertex)

_5.24s · 5,940 video tokens · 496 output tokens · $0.016823 this clip · $0.360938/hr_

Based on the video, here is a detailed and structured explanation of the events:

### Scene Overview
The video takes place in a medical clinic or hospital setting. The main character is **Donald Trump**, dressed in a white doctor’s coat with a stethoscope around his neck and a badge that reads "Donald J. Trump, MD." He is speaking to the camera in a professional tone. Other celebrity figures appear in the video, appearing as "patients" in a clinic exam room, seated on an examination table.

### Key Characters and Order of Appearance
- **Donald Trump** (as "Dr. Trump")
- **Rosie O'Donnell**
- **John Leguizamo**
- **Whoopi Goldberg**
- **Edward Norton**
- **Robert De Niro**
- **Julia Roberts**

### Action Timeline and Content
- **0:00 - 0:10:** Dr. Trump introduces himself and talks about "TDS" (Trump Derangement Syndrome), offering himself as a solution to this condition.
- **0:10 - 0:20:** Rosie O’Donnell speaks about her struggle with the condition and how Dr. Trump's plan has shown results.
- **0:20 - 0:30:** John Leguizamo describes suffering for years, stating he was skeptical until finding this treatment.
- **0:30 - 0:40:** Whoopi Goldberg expresses her relief, saying she once thought she was a "lost cause" but can now see a difference.
- **0:40 - 0:50:** Dr. Trump returns, speaking on camera about how severely affected some of these patients were.
- **0:50 - 1:00:** Edward Norton reflects on how much the condition was impacting his life, work, and appearance.
- **1:00 - 1:10:** Robert De Niro explains his previous symptoms, including anger and making those around him miserable.
- **1:10 - 1:20:** Julia Roberts talks about the stress of the past couple of years and her worry about the future.
- **1:20 - 1:30:** Dr. Trump provides the "treatment plan," advising viewers to "turn off fake news," "say your prayers," and drink a Diet Coke.

### Gemini 3.5 Flash — video · default (`gemini-3.5-flash`, vertex)

_5.70s · 5,940 video tokens · 653 output tokens · $0.008679 this clip · $0.362351/hr_

Here is a detailed breakdown of the video’s events:

### Scene Overview
The video is a satirical spoof formatted like a medical infomercial or news report, featuring former U.S. President Donald Trump and several Hollywood celebrities. The video relies on visual manipulation techniques to place these figures into unexpected medical scenarios. 

### Key Figures and Settings
*   **"Dr. Donald Trump"**: Donald Trump is depicted wearing a white doctor's lab coat, a blue-and-white striped tie, and a stethoscope slung around his neck. His name tag reads "Donald J. Trump, MD." He is positioned in a blurred hospital corridor. 
*   **Celebrity "Patients"**: Rosie O'Donnell, John Leguizamo, Whoopi Goldberg, Edward Norton, Robert De Niro, and Julia Roberts appear individually. They are seated in what looks like a typical doctor's examination room, with medical equipment, a patient table, and posters visible in the background.

### Timeline of Actions and Transitions
*   **0:00 - 0:09**: The video opens with "Dr. Trump" addressing the camera, speaking about "TDS" (Trump Derangement Syndrome). An overlay in the bottom-left corner reads: *"TRUMP POST AI 'DR. TRUMP' VIDEO WITH CELEBRITY TESTIMONIALS ABOUT THEIR 'TDS' — JULY 2, 2026."* 
*   **0:10 - 0:20**: Rosie O'Donnell is shown speaking from the doctor's office, delivering a "testimonial" about her condition.
*   **0:21 - 0:30**: John Leguizamo is shown in the same setting, speaking with a serious expression.
*   **0:31 - 0:40**: Whoopi Goldberg shares her testimony while smiling slightly.
*   **0:41 - 0:50**: The video cuts back to "Dr. Trump" in the corridor, reflecting on the difficulty of treating these patients.
*   **0:51 - 1:00**: Edward Norton speaks to the camera, looking concerned.
*   **1:01 - 1:09**: Robert De Niro appears, discussing the severity of his symptoms.
*   **1:10 - 1:20**: Julia Roberts speaks with a somber and thoughtful expression.
*   **1:21 - 1:30**: "Dr. Trump" returns to explain the simple "treatment plan" (such as drinking a Diet Coke) before the video concludes.

### Technical and Notable Elements
*   **AI Manipulation**: The video utilizes advanced deepfake or AI video-generation software. The mouth movements of Trump and the celebrities are synced to match the scripted dialogue, though their expressions remain slightly static, which is a common characteristic of AI-generated content.
*   **Graphic Overlays**: A watermark in the bottom-right corner displays "DAILY WIRE NEWS." The overall layout mimics a television news broadcast reporting on a social media post.

### Gemini 3.5 Flash — video · high (`gemini-3.5-flash`, vertex)

_6.27s · 23,760 video tokens · 905 output tokens · $0.047233 this clip · $1.433819/hr_

Here is a structured explanation of the video's content:

### **Overview**
The video is a satirical public service announcement (PSA) style video featuring an AI-generated Donald Trump dressed as a doctor, offering a "treatment plan" for "TDS" (Trump Delusion Syndrome). It also features AI-generated clips of famous actors presenting testimonial statements.

---

### **Video Progression**

#### **0:00 - 0:09 | Introduction**
* **Visual:** An AI-generated Donald Trump is shown in a medical hallway wearing a doctor's white coat with "Donald J. Trump, M.D." embroidered on the chest. He has a stethoscope around his neck. 
* **Action:** He speaks directly to the camera, introducing himself as "Dr. Trump" and asking the audience if they or someone they know has been diagnosed with "TDS". 
* **Captions/Graphics:** "TRUMP POST AI 'DR. TRUMP' VIDEO WITH CELEBRITY TESTIMONIALS ABOUT THEIR 'TDS'" is displayed at the bottom of the screen.

#### **0:10 - 0:19 | Rosie O'Donnell Testimonial**
* **Visual:** An AI-generated version of Rosie O'Donnell is seated in what appears to be a doctor's examination room. She is wearing glasses and a black jacket.
* **Action:** She speaks to the camera, explaining how she has been suffering for over a decade, but after listening to Dr. Trump, she can see some results.

#### **0:20 - 0:29 | John Leguizamo Testimonial**
* **Visual:** An AI-generated version of John Leguizamo is shown in the same doctor's examination room. He is wearing a black t-shirt and hoodie.
* **Action:** He speaks to the camera, stating that he has been suffering for years and did not believe help was out there until he saw this video on TV.

#### **0:30 - 0:39 | Whoopi Goldberg Testimonial**
* **Visual:** An AI-generated version of Whoopi Goldberg is shown in the examination room, wearing glasses, dreadlocks, and a black sweater.
* **Action:** She speaks to the camera, explaining how she thought she was a "lost cause" but can now see a difference after using the treatment plan.

#### **0:40 - 0:50 | Dr. Trump Interlude**
* **Visual:** The video cuts back to Dr. Trump in the hospital hallway.
* **Action:** He speaks to the camera, expressing his initial doubt about whether he could help some of these patients because they were "so far gone."

#### **0:51 - 1:00 | Edward Norton Testimonial**
* **Visual:** An AI-generated version of Edward Norton is shown in the examination room, wearing a black blazer.
* **Action:** He speaks to the camera, stating that he had no idea how much this was affecting his life and that he is "hardly recognizable anymore" but just needed help.

#### **1:01 - 1:09 | Robert De Niro Testimonial**
* **Visual:** An AI-generated version of Robert De Niro is shown in the examination room, wearing a dark jacket.
* **Action:** He speaks to the camera, explaining how he couldn't eat or sleep and was constantly angry, making everyone around him miserable.

#### **1:10 - 1:20 | Julia Roberts Testimonial**
* **Visual:** An AI-generated version of Julia Roberts is shown in the examination room, wearing glasses and a black sweater.
* **Action:** She speaks to the camera, explaining how she felt like she had aged 20 years in the last two years and was starting to worry about her future.

#### **1:21 - 1:30 | Conclusion**
* **Visual:** The video cuts back to Dr. Trump in the hospital hallway.
* **Action:** He speaks to the camera, explaining that the treatment is simple: "Turn off fake news, say your prayers, and if you're ever feeling anxious, just have a Diet Coke like me."

### Gemma 4 31B — frames@1fps (`google/gemma-4-31b-it`, gateway)

_107.86s · 90 frames @ 1.00fps across 5 requests · 24,015 image tokens · 919 output tokens · $0.003855 this clip · $0.134976/hr_

Presented as a "Daily Wire News" report, this video consists of a series of rapid cuts featuring several individuals in medical environments. A news banner and ticker remain constant at the bottom of the screen throughout the footage, specifically mentioning "Trump post AI" and "celebrity testimonials."

The video centers on a recurring deepfake depiction of Donald Trump dressed as a doctor, complete with a white lab coat, a blue striped tie, and a stethoscope. He appears multiple times throughout the video, speaking directly to the camera both in a hospital room and a hospital hallway.

Interspersed with the footage of Trump are various "testimonials" from other individuals in clinical settings. These scenes take place in medical examination rooms equipped with white tables and wall-mounted medical tools. The people featured include:
*   A woman wearing glasses and a black hoodie.
*   A man in a black hoodie.
*   A woman with long dreadlocks wearing a white shirt and black blazer.
*   A man with brown hair in a black jacket.
*   A man with gray hair (resembling Robert De Niro) in a brown shirt.
*   A woman with brown hair and glasses wearing a black top.

The video follows a repetitive pattern, alternating between these various speakers in the exam room and the deepfake doctor Trump in the hospital hallway, maintaining the appearance of a structured news broadcast.
