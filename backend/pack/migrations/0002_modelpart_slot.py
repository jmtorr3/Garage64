from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pack', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='modelpart',
            name='slot',
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
