/**
 * OCCAM Ontology Management Page
 * Phase 1: Ontology & Schema Engineering
 *
 * Admin UI for:
 * - Triggering ontology builds
 * - Viewing schema tree
 * - Previewing JSON schemas
 * - Viewing graph relationships
 */

'use client';

import { useState } from 'react';

export default function OntologyManagementPage() {
  const [building, setBuilding] = useState(false);
  const [schema, setSchema] = useState<any>(null);
  const [ontology, setOntology] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBuildOntology = async () => {
    setBuilding(true);
    setError(null);

    try {
      // Example policy input
      const samplePolicies = [
        {
          title: 'Sample Compliance Policy',
          version: '1.0.0',
          sops: [
            {
              owner: 'Compliance Team',
              name: 'Data Protection SOP',
              sections: [
                {
                  name: 'Data Collection',
                  steps: [
                    {
                      description: 'Obtain user consent',
                      responsible: 'Data Protection Officer',
                      clauses: [
                        {
                          text: 'Users must provide explicit consent before data collection',
                          riskLevel: 'high' as const,
                          jurisdiction: 'EU',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const response = await fetch('/api/occam/ontology/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policies: samplePolicies,
          options: {
            autoNumber: true,
            inheritMetadata: true,
            validateReferences: true,
            generateGraph: true,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setOntology(data.ontology);
      } else {
        setError(data.error || 'Failed to build ontology');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to build ontology');
    } finally {
      setBuilding(false);
    }
  };

  const handleFetchSchema = async () => {
    setError(null);

    try {
      const response = await fetch('/api/occam/schema?generateZodSchema=true');
      const data = await response.json();

      if (data.success) {
        setSchema(data.schemas);
      } else {
        setError(data.error || 'Failed to fetch schema');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch schema');
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">OCCAM Ontology Management</h1>
        <p className="text-gray-600">
          Build and manage compliance ontology, view schemas, and explore graph relationships
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">Error</p>
          <p className="text-red-600">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Build Ontology</h2>
          <p className="text-gray-600 mb-4">
            Trigger a full ontology build from policy inputs with auto-numbering, validation, and graph generation
          </p>
          <button
            onClick={handleBuildOntology}
            disabled={building}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {building ? 'Building...' : 'Build Ontology'}
          </button>
        </div>

        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">View Schema</h2>
          <p className="text-gray-600 mb-4">
            Fetch and preview the latest JSON Schema for all compliance entity types
          </p>
          <button
            onClick={handleFetchSchema}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            Fetch Schema
          </button>
        </div>
      </div>

      {ontology && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Ontology Build Result</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded">
              <p className="text-sm text-gray-600">Policies</p>
              <p className="text-2xl font-bold text-blue-600">{ontology.policies.length}</p>
            </div>
            <div className="p-3 bg-green-50 rounded">
              <p className="text-sm text-gray-600">SOPs</p>
              <p className="text-2xl font-bold text-green-600">{ontology.sops.length}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded">
              <p className="text-sm text-gray-600">Sections</p>
              <p className="text-2xl font-bold text-purple-600">{ontology.sections.length}</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded">
              <p className="text-sm text-gray-600">Steps</p>
              <p className="text-2xl font-bold text-yellow-600">{ontology.steps.length}</p>
            </div>
            <div className="p-3 bg-red-50 rounded">
              <p className="text-sm text-gray-600">Clauses</p>
              <p className="text-2xl font-bold text-red-600">{ontology.clauses.length}</p>
            </div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
              View Full Ontology JSON
            </summary>
            <pre className="mt-2 p-4 bg-gray-50 rounded overflow-auto max-h-96 text-xs">
              {JSON.stringify(ontology, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {schema && (
        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Schema Preview</h2>
          <div className="space-y-4">
            {Object.entries(schema).map(([entityType, schemaData]: [string, any]) => (
              <details key={entityType} className="border border-gray-200 rounded">
                <summary className="cursor-pointer p-3 bg-gray-50 hover:bg-gray-100 font-medium">
                  {entityType} Schema
                  <span className="ml-2 text-sm text-gray-500">
                    ({schemaData.metadata.fieldCount} fields, {schemaData.metadata.requiredFields.length} required)
                  </span>
                </summary>
                <div className="p-4">
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-700">Version: {schemaData.metadata.version}</p>
                    <p className="text-sm font-medium text-gray-700">
                      Generated: {new Date(schemaData.metadata.generatedAt).toLocaleString()}
                    </p>
                    <p className="text-sm font-medium text-gray-700">
                      Zod Schema: {schemaData.hasZodSchema ? '✅ Yes' : '❌ No'}
                    </p>
                  </div>
                  <pre className="p-3 bg-gray-50 rounded overflow-auto max-h-64 text-xs">
                    {JSON.stringify(schemaData.jsonSchema, null, 2)}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {!ontology && !schema && (
        <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-500">
            No data to display. Build an ontology or fetch the schema to get started.
          </p>
        </div>
      )}
    </div>
  );
}
