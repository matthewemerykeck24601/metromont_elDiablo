El Diablo (sometimes referenced as Metromont CastLink) is an internal Manufacturing Execution System (MES) and BIM-integrated production platform under active development at Metromont. Its primary goal is to unify production scheduling, erection sequencing, and model-driven reporting into one APS-connected web environment.

Here’s a complete top-level README draft you can place in your repo root to describe the project clearly:

El Diablo MES (Metromont CastLink)
Overview

El Diablo is Metromont’s integrated Manufacturing Execution and BIM coordination platform, designed to bridge production planning, erection sequencing, and model-based data reporting.
It connects to Autodesk Construction Cloud (ACC) using Autodesk Platform Services (APS) and the AEC Data Model GraphQL API, allowing real-time visualization and synchronization between digital design data and plant or site operations.

Core Modules
Module	Description
Production Bed Scheduling	Manages precast bed occupancy, pour schedules, and resource allocation across plants.
Erection Sequence Scheduling	Provides 4D sequencing of model elements by activity and date; integrates directly with ACC AEC Data Model.
Ticket and BOM Exports	Generates standardized Excel exports (_Pieces, _RawConsumables, _Assemblies) following Metromont naming conventions.
Dashboard / Hub	Central entry point for navigating between production and erection modules.
Model Viewer	APS Viewer implementation with custom property filtering, grouping, and animation controls.
Architecture
metromont_elDiablo/
├── index.html                 # Dashboard / landing
├── scheduling-hub.html        # Module selector
├── erection-sequencing.html   # 4D viewer interface
├── scripts/
│   ├── aecdm-graphql.js       # GraphQL helper for AEC Data Model
│   ├── erection-sequencing.js # Main sequencing logic
│   └── scheduling-hub.js      # Hub navigation
├── styles/
│   └── *.css                  # Module-specific styles
├── assets/
│   └── phasing.csv            # Sample schedule
└── README.md                  # This file

Key Features

🔄 ACC Integration – Secure OAuth connection and project retrieval from Autodesk Construction Cloud.

🧩 AEC Data Model GraphQL – Query elements, properties, and element groups natively via GraphQL.

🕓 4D Sequencing – Animate model elements through erection phases using CSV-defined activities or saved schedules.

🧱 Production Planning – Organize precast fabrication and erection sequence using model-driven data.

📊 Data Export – Output structured reports compatible with existing Metromont workflows.

Prerequisites

Autodesk Account with AEC Data Model enabled.

Revit 2024 or newer models published to ACC after AEC DM activation.

APS App with scopes: data:read, account:read, viewables:read.

Node 16+ / npm 8+ (if running locally).

Usage

Log into El Diablo via your company Autodesk credentials.

From the Dashboard, choose Production or Erection Sequencing.

Select your ACC project and model; choose a link property (default “Mark”).

Load a schedule (CSV or saved format).

Play, pause, or step through the timeline to visualize construction progress.

Roadmap

Short term

Property grouping editor and saved view formats

Color-coding by activity type

Export/import of sequences to ACC

Long term

Inline schedule editing

Persistent project-level sequence storage

Real-time collaboration across production and erection teams

Support

Metromont LLC
Email : helpdesk@metromont.com

Web : https://www.metromont.com/
# metromont_castLink