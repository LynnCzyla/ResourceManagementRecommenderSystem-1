"""
📊 Validation Runner - Test OCR Accuracy on 33 Documents
Run this script to validate Module 1 accuracy for Chapter 4
"""
import sys
import os
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from modules.module1_ocr import OCRProcessor
from utils.validators import AccuracyValidator

def run_validation():
    """
    Run validation on 33 documents (13 resumes + 20 certificates)
    as specified in Chapter 4
    """
    print("=" * 60)
    print("📊 Module 1: OCR Accuracy Validation")
    print("=" * 60)
    print("Validation Documents: 33 (13 Resumes + 20 Certificates)")
    print()
    
    # Initialize processors
    ocr = OCRProcessor()
    validator = AccuracyValidator()
    
    # Paths
    base_dir = Path(__file__).parent.parent.parent
    validation_dir = base_dir / 'shared-data' / 'validation'
    ground_truth_dir = validation_dir / 'ground_truth'
    image_dir = validation_dir / 'images'
    results_dir = validation_dir / 'results'
    
    # Create directories if they don't exist
    results_dir.mkdir(parents=True, exist_ok=True)
    
    # Results storage
    validation_results = []
    failed_docs = []
    
    # Get all image files
    image_files = list(image_dir.glob('*.png')) + list(image_dir.glob('*.jpg')) + list(image_dir.glob('*.jpeg'))
    
    print(f"📂 Found {len(image_files)} documents for validation")
    print()
    
    # Process each document
    for idx, doc_file in enumerate(image_files, 1):
        print(f"Processing {idx}/{len(image_files)}: {doc_file.name}")
        
        # Ground truth should be a .txt file with the same name
        gt_file = ground_truth_dir / f"{doc_file.stem}.txt"
        
        if not gt_file.exists():
            print(f"  ⚠️  Warning: No ground truth found for {doc_file.name}")
            failed_docs.append({
                'document': doc_file.name,
                'error': 'No ground truth file found'
            })
            continue
        
        try:
            # Read ground truth
            with open(gt_file, 'r', encoding='utf-8') as f:
                ground_truth = f.read()
            
            # Process document with OCR
            ocr_result = ocr.extract_text(str(doc_file))
            ocr_text = ocr_result['cleaned_text']
            
            # Calculate accuracy metrics
            metrics = validator.calculate_accuracy(ground_truth, ocr_text)
            
            # Determine document type from filename
            doc_type = 'Resume' if 'resume' in doc_file.name.lower() else 'Certificate'
            
            # Store results
            validation_results.append({
                'document_id': idx,
                'file_name': doc_file.name,
                'document_type': doc_type,
                'ocr_confidence': ocr_result['confidence_score'],
                'metrics': metrics,
                'ocr_text_preview': ocr_text[:200] + '...' if len(ocr_text) > 200 else ocr_text,
                'ground_truth_preview': ground_truth[:200] + '...' if len(ground_truth) > 200 else ground_truth
            })
            
            print(f"  ✅ CER: {metrics['cer']:.4f}, WER: {metrics['wer']:.4f}")
            
        except Exception as e:
            print(f"  ❌ Error: {str(e)}")
            failed_docs.append({
                'document': doc_file.name,
                'error': str(e)
            })
    
    # Calculate summary statistics
    if validation_results:
        total_cer = sum(r['metrics']['cer'] for r in validation_results)
        total_wer = sum(r['metrics']['wer'] for r in validation_results)
        n = len(validation_results)
        
        # Categorize by document type
        resumes = [r for r in validation_results if r['document_type'] == 'Resume']
        certificates = [r for r in validation_results if r['document_type'] == 'Certificate']
        
        summary = {
            'validation_date': datetime.now().isoformat(),
            'total_documents_expected': 33,
            'total_documents_processed': len(validation_results),
            'total_documents_failed': len(failed_docs),
            'document_breakdown': {
                'total_resumes': len([r for r in validation_results if r['document_type'] == 'Resume']),
                'total_certificates': len([r for r in validation_results if r['document_type'] == 'Certificate'])
            },
            'overall_metrics': {
                'average_cer': total_cer / n if n > 0 else 0,
                'average_wer': total_wer / n if n > 0 else 0,
                'average_cer_accuracy': (1 - total_cer/n) * 100 if n > 0 else 0,
                'average_wer_accuracy': (1 - total_wer/n) * 100 if n > 0 else 0
            },
            'resume_metrics': {
                'average_cer': sum(r['metrics']['cer'] for r in resumes) / len(resumes) if resumes else 0,
                'average_wer': sum(r['metrics']['wer'] for r in resumes) / len(resumes) if resumes else 0,
                'count': len(resumes)
            } if resumes else {'average_cer': 0, 'average_wer': 0, 'count': 0},
            'certificate_metrics': {
                'average_cer': sum(r['metrics']['cer'] for r in certificates) / len(certificates) if certificates else 0,
                'average_wer': sum(r['metrics']['wer'] for r in certificates) / len(certificates) if certificates else 0,
                'count': len(certificates)
            } if certificates else {'average_cer': 0, 'average_wer': 0, 'count': 0},
            'individual_results': validation_results,
            'failed_documents': failed_docs
        }
        
        # Save results
        results_file = results_dir / f'validation_results_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        with open(results_file, 'w') as f:
            json.dump(summary, f, indent=2)
        
        print()
        print("=" * 60)
        print("📊 Validation Complete!")
        print("=" * 60)
        print(f"✅ Processed: {summary['total_documents_processed']}/33 documents")
        print(f"❌ Failed: {summary['total_documents_failed']}")
        print()
        print("📈 Overall Metrics:")
        print(f"  Average CER: {summary['overall_metrics']['average_cer']:.4f}")
        print(f"  Average WER: {summary['overall_metrics']['average_wer']:.4f}")
        print(f"  CER Accuracy: {summary['overall_metrics']['average_cer_accuracy']:.2f}%")
        print(f"  WER Accuracy: {summary['overall_metrics']['average_wer_accuracy']:.2f}%")
        print()
        print(f"📄 Results saved to: {results_file}")
        
        # Return summary for potential further processing
        return summary
    
    else:
        print("❌ No documents were successfully processed!")
        return None

if __name__ == "__main__":
    run_validation()